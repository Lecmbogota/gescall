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

// New AGI content with fixes
const agiContent = `#!/usr/bin/perl
#
# callerid_local_presence.agi - GesCall CallerID Local Presence
# Fixed for Performance (IPv4, Autoflush)
#

use strict;
use warnings;
use DBI;

$| = 1; # Autoflush STDOUT/STDERR

# Database configuration
my $DB_HOST = '127.0.0.1'; # Force IPv4 to avoid DNS timeout
my $DB_NAME = 'asterisk';
my $DB_USER = 'cron';
my $DB_PASS = '1234';

my $DEBUG = 1;

# Read AGI environment
my %AGI;
while (<STDIN>) {
    chomp;
    last if /^$/;
    if (/^agi_(\\w+)\\:\\s*(.*)$/) {
        $AGI{$1} = $2;
    }
}

# Log function
sub agi_log {
    my ($msg) = @_;
    print STDERR "[GesCall CID] $msg\\n" if $DEBUG;
}

# AGI command
sub agi_exec {
    my ($cmd) = @_;
    print "$cmd\\n";
    my $result = <STDIN>;
    chomp($result) if $result;
    return $result;
}

# Get info
my $phone_number = $ARGV[0] || $AGI{'extension'} || $AGI{'dnid'} || '';
$phone_number =~ s/\\D//g;
my $uniqueid = $AGI{'uniqueid'} || '';
my $uniqueid_base = $uniqueid;
$uniqueid_base =~ s/\\..*$//;

agi_log("START: Phone=$phone_number, UniqueID=$uniqueid_base");

# Get area code
my $area_code = '';
if ($phone_number =~ /^52(\\d{3})/) {
    $area_code = $1; 
} elsif ($phone_number =~ /^(\\d{3})/) {
    $area_code = $1;
}

if (length($area_code) < 3) {
    agi_log("Invalid area code - skipping");
    agi_exec("SET VARIABLE GESCALL_RESULT \\"SKIP\\"");
    exit(0);
}

# Connect DB
agi_log("Connecting to DB...");
my $dsn = "DBI:mysql:database=$DB_NAME;host=$DB_HOST;charset=utf8";
my $dbh = DBI->connect($dsn, $DB_USER, $DB_PASS, { RaiseError => 0, PrintError => 0, ConnectTimeout => 5 });

if (!$dbh) {
    agi_log("ERROR: Cannot connect to database: $DBI::errstr");
    # Fail gracefully
    agi_exec("SET VARIABLE GESCALL_RESULT \\"DB_ERROR\\"");
    exit(0);
}
agi_log("DB Connected");

# Logic...
# Optimized queries
my $campaign_id = '';
my $lead_id = 0;

# Fast lookup in auto_calls
my $sth = $dbh->prepare("SELECT campaign_id, lead_id FROM vicidial_auto_calls WHERE uniqueid LIKE ? LIMIT 1");
$sth->execute("%$uniqueid_base%");
my $call_row = $sth->fetchrow_hashref();
$sth->finish();

if ($call_row && $call_row->{campaign_id}) {
    $campaign_id = $call_row->{campaign_id};
    $lead_id = $call_row->{lead_id};
    agi_log("Found Campaign (auto_calls): $campaign_id");
} else {
    # Fallback to vicidial_log (indexed by uniqueid usually)
    $sth = $dbh->prepare("SELECT campaign_id, lead_id FROM vicidial_log WHERE uniqueid = ? LIMIT 1");
    $sth->execute($uniqueid);
    my $log_row = $sth->fetchrow_hashref();
    $sth->finish();
    
    if ($log_row && $log_row->{campaign_id}) {
        $campaign_id = $log_row->{campaign_id};
        $lead_id = $log_row->{lead_id};
        agi_log("Found Campaign (log): $campaign_id");
    }
}

if (!$campaign_id) { 
    agi_log("No campaign found, using default logic"); 
    # Use PRUEBAS as fallback only for testing consistency? No, risky. 
}

# Settings
my $settings;
if ($campaign_id) {
    $sth = $dbh->prepare("SELECT pool_id, match_mode, fixed_area_code, fallback_callerid, selection_strategy FROM gescall_campaign_callerid_settings WHERE campaign_id = ? AND rotation_mode = 'POOL'");
    $sth->execute($campaign_id);
    $settings = $sth->fetchrow_hashref();
    $sth->finish();
}

# Only proceed if we have settings or default pool logic
# Simplified for speed: If no settings, skip
if (!$settings) {
    # Try default pool
    $sth = $dbh->prepare("SELECT p.id as pool_id, 'ROUND_ROBIN' as selection_strategy, 'LEAD' as match_mode FROM gescall_callerid_pools p JOIN gescall_callerid_pool_numbers n ON p.id = n.pool_id WHERE p.is_active = 1 AND n.area_code = ? AND n.is_active = 1 LIMIT 1");
    $sth->execute($area_code);
    $settings = $sth->fetchrow_hashref();
    $sth->finish();
    
    if ($settings) { agi_log("Using Default Pool"); }
}

if (!$settings) {
    agi_log("No settings or pool - SKIP");
    agi_exec("SET VARIABLE GESCALL_RESULT \\"NO_MATCH\\"");
    $dbh->disconnect;
    exit(0);
}

# Logic for selection
my $target_area_code = ($settings->{match_mode} eq 'FIXED' && $settings->{fixed_area_code}) ? $settings->{fixed_area_code} : $area_code;
agi_log("Selecting CID for Area: $target_area_code");

my $pool_id = $settings->{pool_id};
my $callerid = '';

# Get CID
$sth = $dbh->prepare("SELECT id, callerid FROM gescall_callerid_pool_numbers WHERE pool_id = ? AND area_code = ? AND is_active = 1 ORDER BY rr_order ASC LIMIT 1");
$sth->execute($pool_id, $target_area_code);
my $row = $sth->fetchrow_hashref();
$sth->finish();

if ($row) {
    $callerid = $row->{callerid};
    agi_log("Selected CID: $callerid");
    
    # Update Stats (Async-ish or fast)
    $dbh->do("UPDATE gescall_callerid_pool_numbers SET rr_order = rr_order + 1 WHERE id = " . $row->{id});
    
    agi_exec("SET VARIABLE GESCALL_CID \\"$callerid\\"");
} else {
    agi_log("No CID found in pool");
}

$dbh->disconnect;
exit(0);
`;

const command = `
cat > /usr/share/asterisk/agi-bin/callerid_local_presence.agi << 'EOF'
${agiContent}
EOF
chmod +x /usr/share/asterisk/agi-bin/callerid_local_presence.agi
`;

console.log('Overwriting Remote AGI...\n');

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
            console.log("Upload complete.");
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
