#!/usr/bin/php -q
<?php
/**
 * agi-piper-universal.php
 * Supports TTS_TEXT variable or DB Comments lookup.
 */

$PIPER_BIN    = '/opt/piper/piper';
$PIPER_MODEL  = '/opt/piper/models/es_MX-claude-high.onnx';
$TTS_CACHE    = '/var/lib/asterisk/sounds/tts/piper';
$DB_HOST      = 'localhost';
$DB_USER      = 'cron';
$DB_PASS      = '1234';
$DB_NAME      = 'asterisk';

$in = fopen("php://stdin", "r");
$agi = array();
while (!feof($in)) {
    $line = trim(fgets($in));
    if ($line == '') break; 
    if (preg_match('/^agi_(\w+):\s*(.*)$/', $line, $m)) $agi[$m[1]] = $m[2];
}

function agi_command($cmd) {
    fwrite(STDOUT, "$cmd\n");
    fflush(STDOUT);
    return trim(fgets(STDIN));
}

function agi_log($msg) {
    global $debug_file;
    if ($debug_file) file_put_contents($debug_file, date("Y-m-d H:i:s") . " LOG: $msg\n", FILE_APPEND);
}

$debug_file = "/tmp/piper_universal.log";
file_put_contents($debug_file, "--- NEW CALL ---\n", FILE_APPEND);

// 1. Play Beep
agi_command("STREAM FILE /var/lib/asterisk/sounds/beep \"\"");

// 2. Check for TTS_TEXT Variable
$tts_text = "";
$res = agi_command("GET VARIABLE TTS_TEXT");
if (preg_match('/^200 result=1 \((.*)\)$/', $res, $m)) {
    $tts_text = trim($m[1]);
    if ($tts_text == "(null)") $tts_text = "";
}

$lead_id = isset($argv[1]) ? intval($argv[1]) : 0;
$comments = "";

if (!empty($tts_text)) {
    $comments = $tts_text;
    agi_log("Using TTS_TEXT variable: " . substr($comments, 0, 50) . "...");
} else {
    // DB Lookup
    $mysqli = new mysqli($DB_HOST, $DB_USER, $DB_PASS, $DB_NAME);
    if ($lead_id <= 0) {
        if (isset($agi['calleridname']) && preg_match('/^V\d{9,}(\d{7,})$/', $agi['calleridname'], $m)) {
            $lead_id = intval($m[1]);
        } elseif (isset($agi['uniqueid'])) {
            $uid = $mysqli->real_escape_string($agi['uniqueid']);
            $res = $mysqli->query("SELECT lead_id FROM vicidial_auto_calls WHERE uniqueid='$uid' LIMIT 1");
            if ($res && $res->num_rows > 0) $lead_id = intval($res->fetch_row()[0]);
        }
    }

    if ($lead_id > 0) {
        $stmt = $mysqli->prepare("SELECT comments FROM vicidial_list WHERE lead_id = ? LIMIT 1");
        $stmt->bind_param("i", $lead_id);
        $stmt->execute();
        $res = $stmt->get_result();
        if ($res->num_rows > 0) $comments = trim($res->fetch_assoc()['comments']);
        $stmt->close();
    }
    $mysqli->close();
}

if (empty($comments)) $comments = "Por favor espere un momento.";

// 3. Process Text
$comments = preg_replace('/[^\p{L}\p{N}\s\.\,\!\?\-\:]/u', '', $comments);
$comments = preg_replace('/(\d+)/', ' $1 ', $comments); 
$comments = trim(preg_replace('/\s+/', ' ', $comments));

$sentences = preg_split('/(?<=[.?!])\s+/', $comments, -1, PREG_SPLIT_NO_EMPTY);
if (empty($sentences)) $sentences = array($comments);

// 4. Generate & Play
foreach ($sentences as $index => $sentence) {
    $sentence = trim($sentence);
    if (empty($sentence)) continue;

    $hash = md5($sentence . "_claude_high_1.1");
    $wav_file = "$TTS_CACHE/$hash";

    if (!file_exists("$wav_file.wav")) {
        agi_log("Generating Sentence " . ($index+1));
        
        $remote_url = "http://69.30.85.181:22033/tts";
        $data = json_encode(array("text" => $sentence));
        
        $ch = curl_init($remote_url);
        curl_setopt($ch, CURLOPT_CUSTOMREQUEST, "POST");
        curl_setopt($ch, CURLOPT_POSTFIELDS, $data);
        curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
        curl_setopt($ch, CURLOPT_HTTPHEADER, array(
            'Content-Type: application/json',
            'Authorization: Bearer c15ae3bd04853f118172dec05456c00d3877f17c2c342c709e1cbdb5f9b55d6e',
            'Content-Length: ' . strlen($data)
        ));
        curl_setopt($ch, CURLOPT_TIMEOUT, 10);
        
        $audio_data = curl_exec($ch);
        $http_code = curl_getinfo($ch, CURLINFO_HTTP_CODE);
        curl_close($ch);

        if ($http_code == 200 && $audio_data) {
             file_put_contents("$wav_file.wav", $audio_data);
             exec("sox $wav_file.wav -t raw -r 8000 -c 1 -e signed-integer -b 16 $wav_file.sln 2>/dev/null");
        } else {
             agi_log("Remote TTS Error: $http_code");
        }
    }

    agi_command("STREAM FILE tts/piper/$hash \"\"");
}

// 5. Update Status
if ($lead_id > 0) { // Only update status if we actually had a lead
    $mysqli = new mysqli($DB_HOST, $DB_USER, $DB_PASS, $DB_NAME);
    $stmt = $mysqli->prepare("UPDATE vicidial_list SET status = 'COMPLET' WHERE lead_id = ?");
    $stmt->bind_param("i", $lead_id);
    $stmt->execute();
    $stmt->close();
    $mysqli->close();
}

exit(0);
?>
