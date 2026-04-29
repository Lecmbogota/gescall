#!/usr/bin/php
<?php
/**
 * agi-piper-ivr.php - Vicidial IVR con TTS Piper MODIFICADO
 * V4.1 - Agrega logging de DTMF a vicidial_dial_log.context
 */

$DB_HOST = "localhost";
$DB_USER = "cron";
$DB_PASS = "1234";
$DB_NAME = "asterisk";
$TTS_CACHE = "/var/lib/asterisk/sounds/tts/piper";
$WAIT_SECONDS = 5;

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

/**
 * Smart Tokenization Function
 * Splits a sentence into reusable chunks (static text + dynamic variables)
 * @param string $text Input sentence
 * @return array Array of text chunks
 */
function smart_tokenize($text) {
    // Regex: Captures UPPERCASE names and NUMBERS as separate tokens
    $regex = '/([A-ZÑÁÉÍÓÚ\s]{3,}|\d[\d\s\.\,\-]*)/u';
    
    // Split with delimiter capture to get both static and dynamic parts
    $chunks = preg_split($regex, $text, -1, PREG_SPLIT_DELIM_CAPTURE | PREG_SPLIT_NO_EMPTY);
    
    // Clean up chunks (trim whitespace)
    $chunks = array_map('trim', $chunks);
    $chunks = array_filter($chunks); // Remove empty
    
    return array_values($chunks); // Re-index
}

/**
 * Generate or retrieve audio chunk from cache
 * @param string $chunk Text chunk to generate
 * @return string|null File hash if successful, null on error
 */
function get_audio_chunk($chunk) {
    global $TTS_CACHE;
    
    // Generate hash for this specific chunk
    $hash = md5($chunk . "_claude_high_1.1_chunk");
    $wav_file = "$TTS_CACHE/$hash";
    
    // Check local cache first
    if (file_exists("$wav_file.sln")) {
        agi_log("CACHE HIT: $chunk");
        return $hash;
    }
    
    // Not in cache - request from remote API
    agi_log("CACHE MISS: Generating chunk: " . substr($chunk, 0, 30) . "...");
    
    $remote_url = "http://69.30.85.181:22033/tts";
    $data = json_encode(array("text" => $chunk));
    
    $ch = curl_init($remote_url);
    curl_setopt($ch, CURLOPT_CUSTOMREQUEST, "POST");
    curl_setopt($ch, CURLOPT_POSTFIELDS, $data);
    curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
    curl_setopt($ch, CURLOPT_HTTPHEADER, array(
        'Content-Type: application/json',
        'Authorization: Bearer c15ae3bd04853f118172dec05456c00d3877f17c2c342c709e1cbdb5f9b55d6e',
        'Content-Length: ' . strlen($data)
    ));
    curl_setopt($ch, CURLOPT_CONNECTTIMEOUT, 2);
    curl_setopt($ch, CURLOPT_TIMEOUT, 10);
    
    $audio_data = curl_exec($ch);
    $http_code = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    $curl_error = curl_error($ch);
    curl_close($ch);
    
    if ($http_code == 200 && $audio_data) {
        // Save to local cache (PERSISTENT)
        file_put_contents("$wav_file.wav", $audio_data);
        
        // Convert to SLN for Asterisk
        exec("sox $wav_file.wav -t raw -r 8000 -c 1 -e signed-integer -b 16 $wav_file.sln 2>/dev/null");
        
        agi_log("Generated and cached: $hash");
        return $hash;
    } else {
        // Silent error handling - log but don't crash
        agi_log("ERROR generating chunk: HTTP $http_code - $curl_error");
        return null;
    }
}

// ============= LOG DTMF TO DATABASE =============
function log_dtmf_to_db($lead_id, $dtmf) {
    global $DB_HOST, $DB_USER, $DB_PASS, $DB_NAME;
    
    if ($lead_id <= 0) return;
    
    $dtmf_str = ($dtmf == 50) ? "2" : (($dtmf > 0) ? chr($dtmf) : "");
    if (empty($dtmf_str)) $dtmf_str = "NONE";
    
    $mysqli = new mysqli($DB_HOST, $DB_USER, $DB_PASS, $DB_NAME);
    if ($mysqli->connect_error) {
        agi_log("DB Error: " . $mysqli->connect_error);
        return;
    }
    
    // Update vicidial_dial_log.context with DTMF info using lead_id
    // Get the most recent dial_log record for this lead
    $stmt = $mysqli->prepare("UPDATE vicidial_dial_log SET context = ? WHERE lead_id = ? ORDER BY call_date DESC LIMIT 1");
    $context_val = "DTMF:" . $dtmf_str;
    $stmt->bind_param("si", $context_val, $lead_id);
    $result = $stmt->execute();
    $affected = $mysqli->affected_rows;
    
    agi_log("Logged DTMF '$dtmf_str' to dial_log for lead_id $lead_id (affected: $affected)");
    
    $mysqli->close();
}

// ============= LOG CALL TO GESCALL_CALL_LOG =============
function log_call_to_gescall($lead_id, $phone_number, $campaign_id, $list_id, $dtmf, $call_status, $uniqueid) {
    global $DB_HOST, $DB_USER, $DB_PASS, $DB_NAME, $call_start_time;
    
    if ($lead_id <= 0) return;
    
    $mysqli = new mysqli($DB_HOST, $DB_USER, $DB_PASS, $DB_NAME);
    if ($mysqli->connect_error) {
        agi_log("DB Error gescall_call_log: " . $mysqli->connect_error);
        return;
    }
    
    // Get pool CallerID from gescall_callerid_usage_log
    $pool_callerid = null;
    $stmt = $mysqli->prepare("SELECT callerid_used FROM gescall_callerid_usage_log WHERE lead_id = ? ORDER BY created_at DESC LIMIT 1");
    if ($stmt) {
        $stmt->bind_param("i", $lead_id);
        $stmt->execute();
        $res = $stmt->get_result();
        if ($res->num_rows > 0) {
            $pool_callerid = $res->fetch_assoc()['callerid_used'];
        }
        $stmt->close();
    }
    
    // Calculate duration
    $duration = isset($call_start_time) ? (time() - $call_start_time) : 0;
    
    // DTMF string
    $dtmf_str = ($dtmf == 50) ? "2" : (($dtmf > 0) ? chr($dtmf) : null);
    
    // Insert into gescall_call_log
    $stmt = $mysqli->prepare("
        INSERT INTO gescall_call_log 
        (lead_id, phone_number, pool_callerid, campaign_id, list_id, call_date, call_status, dtmf_pressed, call_duration, uniqueid)
        VALUES (?, ?, ?, ?, ?, NOW(), ?, ?, ?, ?)
        ON DUPLICATE KEY UPDATE 
            call_status = VALUES(call_status),
            dtmf_pressed = VALUES(dtmf_pressed),
            call_duration = VALUES(call_duration),
            updated_at = NOW()
    ");
    
    if ($stmt) {
        $stmt->bind_param("isssissis", $lead_id, $phone_number, $pool_callerid, $campaign_id, $list_id, $call_status, $dtmf_str, $duration, $uniqueid);
        $result = $stmt->execute();
        agi_log("Logged to gescall_call_log: lead=$lead_id, status=$call_status, dtmf=$dtmf_str, duration=$duration");
        $stmt->close();
    } else {
        agi_log("Error preparing gescall_call_log insert: " . $mysqli->error);
    }
    
    $mysqli->close();
}
// ================================================

$debug_file = "/tmp/piper_ivr_debug.log";
file_put_contents($debug_file, "--- NEW CALL IVR V4.2 (GESCALL LOGGING) ---\n", FILE_APPEND);

// Get uniqueid for logging
$uniqueid = isset($agi['uniqueid']) ? $agi['uniqueid'] : "";
agi_log("UniqueID: $uniqueid");

// Track call start time for duration calculation
$call_start_time = time();

// 1. REPRODUCIR BEEP
agi_command("STREAM FILE /var/lib/asterisk/sounds/beep \"2\""); 

// 2. RECUPERAR DATOS (Business Logic - INTACTO)
$lead_id = isset($argv[1]) ? intval($argv[1]) : 0;
$mysqli = new mysqli($DB_HOST, $DB_USER, $DB_PASS, $DB_NAME);

if ($lead_id <= 0 && isset($agi['calleridname']) && preg_match('/^V\d{9,}(\d{7,})$/', $agi['calleridname'], $m)) {
    $lead_id = intval($m[1]);
}

$transfer_number = "";
$comments = "";
$campaign_id = "";
$list_id = 0;

if ($lead_id > 0) {
    $stmt = $mysqli->prepare("SELECT comments, list_id FROM vicidial_list WHERE lead_id = ? LIMIT 1");
    $stmt->bind_param("i", $lead_id);
    $stmt->execute();
    $res = $stmt->get_result();
    if ($res->num_rows > 0) {
        $row = $res->fetch_assoc();
        $comments = trim($row['comments']);
        $list_id = $row['list_id'];
        
        $stmt_list = $mysqli->prepare("SELECT campaign_id FROM vicidial_lists WHERE list_id = ? LIMIT 1");
        $stmt_list->bind_param("s", $list_id);
        $stmt_list->execute();
        $res_list = $stmt_list->get_result();
        if ($res_list->num_rows > 0) {
            $campaign_id = $res_list->fetch_assoc()['campaign_id'];
        }
    }
}

if (!empty($campaign_id)) {
    $stmt_camp = $mysqli->prepare("SELECT xferconf_c_number FROM vicidial_campaigns WHERE campaign_id = ? LIMIT 1");
    $stmt_camp->bind_param("s", $campaign_id);
    $stmt_camp->execute();
    $res_camp = $stmt_camp->get_result();
    if ($res_camp->num_rows > 0) {
        $transfer_number = trim($res_camp->fetch_assoc()['xferconf_c_number']);
    }
}

agi_log("Lead: $lead_id | Campaña: $campaign_id | Desvio: $transfer_number");

if (empty($comments)) $comments = "Por favor espere.";

// Pre-procesamiento
$comments = preg_replace('/[^\p{L}\p{N}\s\.\,\!\?\-\:]/u', '', $comments);
$comments = preg_replace('/(\d+)/', ' $1 ', $comments); 
$comments = trim(preg_replace('/\s+/', ' ', $comments));
$sentences = preg_split('/(?<=[.?!])\s+/', $comments, -1, PREG_SPLIT_NO_EMPTY);
if (empty($sentences)) $sentences = array($comments);

// Función de Transferencia (INTACTO)
function do_transfer($number) {
    global $mysqli, $lead_id, $uniqueid;
    agi_log("¡DESVIO ACTIVADO! Transfiriendo a $number");
    
    if ($lead_id > 0) {
        $mysqli->query("UPDATE vicidial_list SET status='XFER' WHERE lead_id='$lead_id'");
    }
    
    // LOG DTMF = 2 (transfer requested)
    log_dtmf_to_db($lead_id, 50);
    
    agi_command("STREAM FILE espera_asesor \"\"");
    
    $dial_str = "SIP/sbc233/1122" . $number;
    $result = agi_command("EXEC Dial \"$dial_str,45,m\"");
    
    agi_log("Resultado Dial: $result");
    exit(0);
}

function check_dtmf($result) {
    if (preg_match('/result=(\d+)/', $result, $m)) {
        return intval($m[1]);
    }
    return 0;
}

// 3. BUCLE DE REPRODUCCION CON TOKENIZACION INTELIGENTE
$dtmf_pressed = 0;
foreach ($sentences as $sentence_index => $sentence) {
    $sentence = trim($sentence);
    if (empty($sentence)) continue;
    
    agi_log("Processing sentence: $sentence");
    
    // TOKENIZE: Split into reusable chunks
    $chunks = smart_tokenize($sentence);
    agi_log("Tokenized into " . count($chunks) . " chunks");
    
    // Process each chunk
    foreach ($chunks as $chunk_index => $chunk) {
        if (empty($chunk)) continue;
        
        // Get audio (from cache or generate)
        $hash = get_audio_chunk($chunk);
        
        if ($hash === null) {
            // Error generating - skip this chunk silently
            agi_log("Skipping chunk due to generation error");
            continue;
        }
        
        // Play chunk
        $result = agi_command("STREAM FILE tts/piper/$hash \"2\"");
        $dtmf_pressed = check_dtmf($result);
        
        // Check DTMF after EVERY chunk
        if ($dtmf_pressed == 50) { // ASCII '2'
            agi_log("DTMF detected mid-playback!");
            if (!empty($transfer_number)) {
                do_transfer($transfer_number);
            } else {
                agi_log("Usuario presiono 2 pero NO hay numero configurado");
                // Still log it
                log_dtmf_to_db($lead_id, 50);
            }
            break 2; // Exit both loops
        }
    }
    
    // If DTMF was pressed, stop processing sentences
    if ($dtmf_pressed == 50) {
        break;
    }
}

// 4. ESPERAR DESPUÉS DEL AUDIO (si no presionó nada)
if ($dtmf_pressed != 50) {
    agi_log("Audio terminado. Esperando $WAIT_SECONDS segundos para DTMF...");
    
    $result = agi_command("WAIT FOR DIGIT " . ($WAIT_SECONDS * 1000));
    $dtmf_pressed = check_dtmf($result);
    
    agi_log("WAIT FOR DIGIT resultado: $result (dtmf=$dtmf_pressed)");
    
    if ($dtmf_pressed == 50 && !empty($transfer_number)) {
        do_transfer($transfer_number);
    } else if ($dtmf_pressed > 0) {
        // Log any other DTMF
        log_dtmf_to_db($lead_id, $dtmf_pressed);
    } else {
        // Log no DTMF pressed
        log_dtmf_to_db($lead_id, 0);
    }
}

// 5. Si no presionó nada, marcar como COMPLET
$final_status = 'HANGUP';
if ($lead_id > 0) {
    $mysqli->query("UPDATE vicidial_list SET status='COMPLET' WHERE lead_id='$lead_id'");
    $final_status = 'ANSWER';
}

// Get phone number from lead
$phone_number = '';
if ($lead_id > 0) {
    $stmt_phone = $mysqli->prepare("SELECT phone_number FROM vicidial_list WHERE lead_id = ? LIMIT 1");
    if ($stmt_phone) {
        $stmt_phone->bind_param("i", $lead_id);
        $stmt_phone->execute();
        $res_phone = $stmt_phone->get_result();
        if ($res_phone->num_rows > 0) {
            $phone_number = $res_phone->fetch_assoc()['phone_number'];
        }
        $stmt_phone->close();
    }
}

// Log to gescall_call_log
log_call_to_gescall($lead_id, $phone_number, $campaign_id, $list_id, $dtmf_pressed, $final_status, $uniqueid);

$mysqli->close();
agi_log("Llamada finalizada sin transferencia.");
exit(0);
?>
