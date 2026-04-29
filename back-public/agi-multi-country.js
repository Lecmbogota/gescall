require('dotenv').config({ path: '/opt/gescall/back/.env' });
const { Client } = require('ssh2');

const sshConfig = {
    host: process.env.VICIDIAL_SSH_HOST || '209.38.233.46',
    port: 22,
    username: process.env.VICIDIAL_SSH_USER || 'root',
    password: process.env.VICIDIAL_SSH_PASSWORD,
    readyTimeout: 20000,
    keepaliveInterval: 5000,
    tryKeyboard: true,
};

// Multi-country AGI: Supports multiple country prefixes
const agiContent = `#!/usr/bin/perl
#
# callerid_local_presence.agi - GesCall CallerID Rotation
# Multi-country support: Strips common Latin American prefixes
#

use strict;
use warnings;
use DBI;

$| = 1;

my $DB_HOST = '127.0.0.1';
my $DB_NAME = 'asterisk';
my $DB_USER = 'cron';
my $DB_PASS = '1234';
my $DEBUG = 1;

my %AGI;
while (<STDIN>) {
    chomp;
    last if /^$/;
    if (/^agi_(\\w+)\\:\\s*(.*)$/) {
        $AGI{$1} = $2;
    }
}

sub agi_log {
    my ($msg) = @_;
    print STDERR "[GesCall CID] $msg\\n" if $DEBUG;
}

sub agi_exec {
    my ($cmd) = @_;
    print "$cmd\\n";
    my $result = <STDIN>;
    chomp($result) if $result;
    return $result;
}

# Common Latin American country codes (2 digits)
my @country_codes = ('52', '54', '55', '56', '57', '58', '51', '53', '59');

# Get the destination phone number
my $phone_raw = $AGI{'extension'} || $AGI{'dnid'} || '';
$phone_raw =~ s/\\D//g;

agi_log("START: Raw Phone=$phone_raw");

if (!$phone_raw || length($phone_raw) < 10) {
    agi_log("Invalid phone number - exiting");
    exit(0);
}

# Connect DB
my $dsn = "DBI:mysql:database=$DB_NAME;host=$DB_HOST;charset=utf8";
my $dbh = DBI->connect($dsn, $DB_USER, $DB_PASS, { RaiseError => 0, PrintError => 0 });

if (!$dbh) {
    agi_log("ERROR: Cannot connect to database");
    exit(0);
}

# Try to find campaign - first with full number, then try stripping prefixes
my $campaign_id = '';
my @phone_variants = ($phone_raw);

# Generate variants by stripping country codes
foreach my $cc (@country_codes) {
    if ($phone_raw =~ /^$cc(\\d{10})$/) {
        push @phone_variants, $1;
    }
}

agi_log("Trying variants: " . join(", ", @phone_variants));

foreach my $phone (@phone_variants) {
    my $sth = $dbh->prepare("SELECT campaign_id FROM vicidial_auto_calls WHERE phone_number = ? LIMIT 1");
    $sth->execute($phone);
    my $row = $sth->fetchrow_hashref();
    $sth->finish();
    
    if ($row && $row->{campaign_id}) {
        $campaign_id = $row->{campaign_id};
        agi_log("Found Campaign: $campaign_id (using phone: $phone)");
        last;
    }
}

if (!$campaign_id) {
    agi_log("No campaign found for any phone variant");
    $dbh->disconnect;
    exit(0);
}

# Get pool_id for this campaign
my $sth = $dbh->prepare("SELECT pool_id FROM gescall_campaign_callerid_settings WHERE campaign_id = ? AND rotation_mode = 'POOL'");
$sth->execute($campaign_id);
my $row = $sth->fetchrow_hashref();
$sth->finish();

my $pool_id = $row ? $row->{pool_id} : undef;
if (!$pool_id) {
    agi_log("No pool assigned to campaign $campaign_id");
    $dbh->disconnect;
    exit(0);
}

agi_log("Pool ID: $pool_id");

# Get NEXT CallerID from pool (round-robin)
$sth = $dbh->prepare("SELECT id, callerid FROM gescall_callerid_pool_numbers WHERE pool_id = ? AND is_active = 1 ORDER BY rr_order ASC LIMIT 1");
$sth->execute($pool_id);
$row = $sth->fetchrow_hashref();
$sth->finish();

if ($row && $row->{callerid}) {
    my $callerid = $row->{callerid};
    my $cid_id = $row->{id};
    
    agi_log("SELECTED CID: $callerid");
    
    # Update round-robin order
    my $max_sth = $dbh->prepare("SELECT COALESCE(MAX(rr_order),0)+1 as new_order FROM gescall_callerid_pool_numbers WHERE pool_id = ?");
    $max_sth->execute($pool_id);
    my $max_row = $max_sth->fetchrow_hashref();
    $max_sth->finish();
    my $new_order = $max_row->{new_order} || 1;
    
    $dbh->do("UPDATE gescall_callerid_pool_numbers SET rr_order = ?, last_used_at = NOW(), use_count = use_count + 1 WHERE id = ?", undef, $new_order, $cid_id);
    
    # Set AGI variable
    agi_exec("SET VARIABLE GESCALL_CID \\"$callerid\\"");
} else {
    agi_log("No CallerID found in pool $pool_id");
}

$dbh->disconnect;
exit(0);
`;

const command = `
cat > /usr/share/asterisk/agi-bin/callerid_local_presence.agi << 'EOF'
${agiContent}
EOF
chmod +x /usr/share/asterisk/agi-bin/callerid_local_presence.agi
echo "AGI Updated - Multi-country support"
`;

console.log('Updating AGI for Multi-Country Support...\n');

const conn = new Client();

conn.on('ready', () => {
    conn.exec(command, (err, stream) => {
        if (err) {
            console.error('Exec error:', err);
            conn.end();
            return;
        }
        let output = '';
        stream.on('close', (code) => {
            console.log(output);
            conn.end();
        }).on('data', (data) => {
            output += data;
        }).stderr.on('data', (data) => {
            output += data;
        });
    });
});

conn.on('error', (err) => {
    console.error('SSH Connection error:', err.message);
    process.exit(1);
});

conn.on('keyboard-interactive', (name, instructions, instructionsLang, prompts, finish) => {
    finish([sshConfig.password]);
});

conn.connect(sshConfig);
