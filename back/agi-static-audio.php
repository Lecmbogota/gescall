#!/usr/bin/php
<?php
/**
 * agi-static-audio.php - Reproduce audio estático para campañas
 * V1.0 - Reproduce un archivo de audio predefinido
 */

$DB_HOST = "localhost";
$DB_USER = "cron";
$DB_PASS = "1234";
$DB_NAME = "asterisk";
$AUDIO_PATH = "/var/lib/asterisk/sounds";
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
    $stmt = $mysqli->prepare("UPDATE vicidial_dial_log SET context = ? WHERE lead_id = ? ORDER BY call_date DESC LIMIT 1");
    $context_val = "DTMF:" . $dtmf_str;
    $stmt->bind_param("si", $context_val, $lead_id);
    $stmt->execute();
    $mysqli->close();
}
// ================================================

$debug_file = "/tmp/static_audio_debug.log";
file_put_contents($debug_file, "--- NEW STATIC AUDIO CALL V1.0 ---\n", FILE_APPEND);

// Get uniqueid for logging
$uniqueid = isset($agi['uniqueid']) ? $agi['uniqueid'] : "";
agi_log("UniqueID: $uniqueid");

// 1. REPRODUCIR BEEP
agi_command("STREAM FILE /var/lib/asterisk/sounds/beep \"2\""); 

// 2. RECUPERAR DATOS
$lead_id = isset($argv[1]) ? intval($argv[1]) : 0;
$audio_filename = isset($argv[2]) ? trim($argv[2]) : "";

$mysqli = new mysqli($DB_HOST, $DB_USER, $DB_PASS, $DB_NAME);

if ($lead_id <= 0 && isset($agi['calleridname']) && preg_match('/^V\d{9,}(\d{7,})$/', $agi['calleridname'], $m)) {
    $lead_id = intval($m[1]);
}

$transfer_number = "";
$campaign_id = "";

if ($lead_id > 0) {
    $stmt = $mysqli->prepare("SELECT list_id FROM vicidial_list WHERE lead_id = ? LIMIT 1");
    $stmt->bind_param("i", $lead_id);
    $stmt->execute();
    $res = $stmt->get_result();
    if ($res->num_rows > 0) {
        $list_id = $res->fetch_assoc()['list_id'];
        
        $stmt_list = $mysqli->prepare("SELECT campaign_id FROM vicidial_lists WHERE list_id = ? LIMIT 1");
        $stmt_list->bind_param("s", $list_id);
        $stmt_list->execute();
        $res_list = $stmt_list->get_result();
        if ($res_list->num_rows > 0) {
            $campaign_id = $res_list->fetch_assoc()['campaign_id'];
        }
    }
}

// Obtener número de transferencia si existe
if (!empty($campaign_id)) {
    $stmt_camp = $mysqli->prepare("SELECT xferconf_c_number FROM vicidial_campaigns WHERE campaign_id = ? LIMIT 1");
    $stmt_camp->bind_param("s", $campaign_id);
    $stmt_camp->execute();
    $res_camp = $stmt_camp->get_result();
    if ($res_camp->num_rows > 0) {
        $transfer_number = trim($res_camp->fetch_assoc()['xferconf_c_number']);
    }
}

agi_log("Lead: $lead_id | Campaña: $campaign_id | Audio: $audio_filename | Desvio: $transfer_number");

// Si no se proporcionó audio_filename como argumento, intentar obtenerlo de la BD
if (empty($audio_filename) && !empty($campaign_id)) {
    $stmt_audio = $mysqli->prepare("SELECT audio_filename FROM gescall_campaign_playback WHERE campaign_id = ? LIMIT 1");
    $stmt_audio->bind_param("s", $campaign_id);
    $stmt_audio->execute();
    $res_audio = $stmt_audio->get_result();
    if ($res_audio->num_rows > 0) {
        $audio_filename = trim($res_audio->fetch_assoc()['audio_filename']);
    }
}

// Función de Transferencia
function do_transfer($number) {
    global $mysqli, $lead_id, $uniqueid;
    agi_log("¡DESVIO ACTIVADO! Transfiriendo a $number");
    
    if ($lead_id > 0) {
        $mysqli->query("UPDATE vicidial_list SET status='XFER' WHERE lead_id='$lead_id'");
    }
    
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

// 3. REPRODUCIR AUDIO ESTÁTICO
if (!empty($audio_filename)) {
    // Remover extensión si está presente (Asterisk puede manejarlo automáticamente)
    $audio_file = preg_replace('/\.(wav|gsm|ulaw|alaw|sln)$/i', '', $audio_filename);
    
    // Buscar el archivo en diferentes ubicaciones
    $audio_paths = [
        "$AUDIO_PATH/$audio_file",
        "$AUDIO_PATH/$audio_filename",
        "/var/lib/asterisk/sounds/custom/$audio_file",
        "/var/lib/asterisk/sounds/custom/$audio_filename"
    ];
    
    $found = false;
    foreach ($audio_paths as $path) {
        // Intentar con diferentes extensiones
        foreach (['', '.wav', '.gsm', '.ulaw', '.alaw', '.sln'] as $ext) {
            $full_path = $path . $ext;
            if (file_exists($full_path)) {
                $audio_file = $full_path;
                $found = true;
                break 2;
            }
        }
    }
    
    if ($found) {
        agi_log("Reproduciendo audio: $audio_file");
        $result = agi_command("STREAM FILE $audio_file \"2\"");
        $dtmf_pressed = check_dtmf($result);
        
        // Si presionó 2 y hay número de transferencia
        if ($dtmf_pressed == 50 && !empty($transfer_number)) {
            do_transfer($transfer_number);
            exit(0);
        } else if ($dtmf_pressed > 0) {
            log_dtmf_to_db($lead_id, $dtmf_pressed);
        }
    } else {
        agi_log("ERROR: Audio file no encontrado: $audio_filename");
        // Reproducir mensaje de error o silencio
        agi_command("STREAM FILE silence/1 \"\"");
    }
} else {
    agi_log("ERROR: No se especificó archivo de audio");
    agi_command("STREAM FILE silence/1 \"\"");
}

// 4. ESPERAR DESPUÉS DEL AUDIO (si no presionó nada)
if (!isset($dtmf_pressed) || $dtmf_pressed != 50) {
    agi_log("Audio terminado. Esperando $WAIT_SECONDS segundos para DTMF...");
    
    $result = agi_command("WAIT FOR DIGIT " . ($WAIT_SECONDS * 1000));
    $dtmf_pressed = check_dtmf($result);
    
    agi_log("WAIT FOR DIGIT resultado: $result (dtmf=$dtmf_pressed)");
    
    if ($dtmf_pressed == 50 && !empty($transfer_number)) {
        do_transfer($transfer_number);
    } else if ($dtmf_pressed > 0) {
        log_dtmf_to_db($lead_id, $dtmf_pressed);
    } else {
        log_dtmf_to_db($lead_id, 0);
    }
}

// 5. Si no presionó nada, marcar como COMPLET
if ($lead_id > 0 && (!isset($dtmf_pressed) || $dtmf_pressed != 50)) {
    $mysqli->query("UPDATE vicidial_list SET status='COMPLET' WHERE lead_id='$lead_id'");
}

$mysqli->close();
agi_log("Llamada finalizada sin transferencia.");
