#!/usr/bin/php
<?php
/**
 * agi-playback-switch.php - Switch entre TTS (Piper) y Audio Estático
 * V1.0 - Consulta gescall_campaign_playback y ejecuta el AGI correspondiente
 */

$DB_HOST = "localhost";
$DB_USER = "cron";
$DB_PASS = "1234";
$DB_NAME = "asterisk";

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

$debug_file = "/tmp/playback_switch_debug.log";
file_put_contents($debug_file, "--- NEW PLAYBACK SWITCH CALL V1.0 ---\n", FILE_APPEND);

// Get uniqueid for logging
$uniqueid = isset($agi['uniqueid']) ? $agi['uniqueid'] : "";
agi_log("UniqueID: $uniqueid");

// 1. OBTENER LEAD_ID Y CAMPAIGN_ID
$lead_id = isset($argv[1]) ? intval($argv[1]) : 0;

$mysqli = new mysqli($DB_HOST, $DB_USER, $DB_PASS, $DB_NAME);
if ($mysqli->connect_error) {
    agi_log("ERROR: Database connection failed: " . $mysqli->connect_error);
    exit(1);
}

// Si no se proporcionó lead_id, intentar obtenerlo del calleridname (formato Vicidial)
if ($lead_id <= 0 && isset($agi['calleridname']) && preg_match('/^V\d{9,}(\d{7,})$/', $agi['calleridname'], $m)) {
    $lead_id = intval($m[1]);
    agi_log("Lead ID extraído del calleridname: $lead_id");
}

// Si aún no tenemos lead_id, intentar obtenerlo desde variables de canal
if ($lead_id <= 0) {
    $vars_to_check = array('LEAD_ID', 'lead_id', 'VICIDIAL_LEAD_ID', 'CHANNEL(leadid)');
    foreach ($vars_to_check as $var) {
        $result = agi_command("GET VARIABLE $var");
        if (preg_match('/^200 result=1 \(([^\)]+)\)$/', $result, $m)) {
            $lead_id = intval(trim($m[1]));
            if ($lead_id > 0) {
                agi_log("Lead ID obtenido desde variable $var: $lead_id");
                break;
            }
        }
    }
}

// Si aún no tenemos lead_id, intentar obtenerlo desde el uniqueid y vicidial_dial_log
if ($lead_id <= 0 && isset($agi['uniqueid'])) {
    $uniqueid = $agi['uniqueid'];
    $stmt = $mysqli->prepare("SELECT lead_id, campaign_id FROM vicidial_dial_log WHERE caller_code = ? ORDER BY call_date DESC LIMIT 1");
    $stmt->bind_param("s", $uniqueid);
    $stmt->execute();
    $res = $stmt->get_result();
    if ($res->num_rows > 0) {
        $row = $res->fetch_assoc();
        $lead_id = intval($row['lead_id']);
        if (empty($campaign_id) && !empty($row['campaign_id'])) {
            $campaign_id = $row['campaign_id'];
        }
        agi_log("Lead ID obtenido desde dial_log: $lead_id");
    }
}

$campaign_id = "";

// Obtener campaign_id desde lead_id
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
            agi_log("Campaign ID obtenido: $campaign_id");
        }
    }
}

// Si aún no tenemos campaign_id, intentar obtenerlo desde variables de canal
if (empty($campaign_id)) {
    // Intentar obtener desde CDR accountcode u otras variables
    $campaign_id = isset($agi['accountcode']) ? trim($agi['accountcode']) : "";
    if (empty($campaign_id)) {
        // Buscar en variables de canal usando AGI GET VARIABLE (Vicidial puede usar diferentes nombres)
        $vars_to_check = array('CAMPAIGN', 'campaign_id', 'CAMPAIGN_ID', 'VICIDIAL_CAMPAIGN');
        foreach ($vars_to_check as $var) {
            $result = agi_command("GET VARIABLE $var");
            if (preg_match('/^200 result=1 \(([^\)]+)\)$/', $result, $m)) {
                $campaign_id = trim($m[1]);
                agi_log("Campaign ID obtenido desde variable $var: $campaign_id");
                break;
            }
        }
    }
}

// Si aún no tenemos campaign_id pero tenemos lead_id, usar directamente PRUEBAS como fallback para pruebas
if (empty($campaign_id) && $lead_id > 0) {
    agi_log("WARNING: No se pudo obtener campaign_id. Intentando usar PRUEBAS como fallback.");
    $campaign_id = "PRUEBAS"; // Fallback para pruebas
}

// 2. CONSULTAR CONFIGURACIÓN DE PLAYBACK
$playback_mode = "tts"; // Default
$audio_filename = "";

if (!empty($campaign_id)) {
    $stmt_playback = $mysqli->prepare("SELECT playback_mode, audio_filename FROM gescall_campaign_playback WHERE campaign_id = ? LIMIT 1");
    $stmt_playback->bind_param("s", $campaign_id);
    $stmt_playback->execute();
    $res_playback = $stmt_playback->get_result();
    
    if ($res_playback->num_rows > 0) {
        $row = $res_playback->fetch_assoc();
        $playback_mode = trim($row['playback_mode']);
        $audio_filename = isset($row['audio_filename']) ? trim($row['audio_filename']) : "";
        agi_log("Playback mode encontrado: $playback_mode | Audio: $audio_filename");
    } else {
        agi_log("No se encontró configuración para campaign_id: $campaign_id. Usando TTS por defecto.");
    }
} else {
    agi_log("WARNING: No se pudo determinar campaign_id. Usando TTS por defecto.");
}

$mysqli->close();

// 3. EJECUTAR EL AGI CORRESPONDIENTE
// Usar passthru para ejecutar el script manteniendo stdin/stdout del contexto AGI
if ($playback_mode === "static_audio") {
    agi_log("Ejecutando AGI para audio estático...");
    
    // Construir comando
    $cmd = "/usr/bin/php /var/lib/asterisk/agi-bin/agi-static-audio.php";
    if ($lead_id > 0) {
        $cmd .= " $lead_id";
    }
    if (!empty($audio_filename)) {
        $cmd .= " " . escapeshellarg($audio_filename);
    }
    
    // Ejecutar manteniendo stdin/stdout
    passthru($cmd);
    exit(0);
    
} else {
    // Default: TTS con Piper
    agi_log("Ejecutando AGI para TTS (Piper)...");
    
    // Construir comando
    $cmd = "/usr/bin/php /var/lib/asterisk/agi-bin/agi-piper-ivr-dtmf.php";
    if ($lead_id > 0) {
        $cmd .= " $lead_id";
    }
    
    // Ejecutar manteniendo stdin/stdout
    passthru($cmd);
    exit(0);
}

agi_log("Playback switch completado.");
