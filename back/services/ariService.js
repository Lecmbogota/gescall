/**
 * ariService.js — GesCall ARI IVR Engine
 * Connects to Asterisk ARI via WebSocket and executes IVR flows per campaign.
 */

const ariClient = require('ari-client');
const http = require('http');
const fs = require('fs');
const crypto = require('crypto');
const path = require('path');
const { execSync } = require('child_process');
const redis = require('../config/redisClient');
const { STATUS, IVR_OUTCOME, fromAsteriskState } = require('../config/callStatus');

const TTS_CACHE = '/var/lib/asterisk/sounds/tts/piper';
const TTS_API = process.env.PIPER_TTS_URL || 'http://127.0.0.1:5000/tts';
const ARI_URL = process.env.ARI_URL || 'http://localhost:8088';
const ARI_USER = process.env.ARI_USER || 'gescall';
const ARI_PASS = process.env.ARI_PASS || 'gescall_ari_2026';

let ari = null;
let db = null;
let io = null;

// Active calls tracking
const activeCalls = new Map(); // channelId -> { leadId, campaignId, flowState, ... }

// Queue Management (Holding Bridges)
const campaignBridges = new Map(); // campaignId -> bridgeId
const queueWaiters = new Map(); // campaignId -> [{ channelId, joinTime, leadId }]
let dispatcherInterval = null;

/**
 * Initialize ARI connection
 */
async function init(dbPool, socketIo) {
    db = dbPool;
    io = socketIo;

    // Ensure TTS cache directory exists
    if (!fs.existsSync(TTS_CACHE)) {
        fs.mkdirSync(TTS_CACHE, { recursive: true });
    }

    try {
        ari = await ariClient.connect(ARI_URL, ARI_USER, ARI_PASS);
        console.log('[ARI] Connected to Asterisk ARI');

        // Register Stasis application
        ari.on('StasisStart', handleStasisStart);
        ari.on('StasisEnd', handleStasisEnd);
        ari.on('ChannelDtmfReceived', handleDtmf);
        ari.on('ChannelDestroyed', handleGlobalChannelDestroyed);
        ari.on('ChannelStateChange', handleGlobalChannelStateChange);

        ari.start('gescall-ivr');
        console.log('[ARI] Stasis application "gescall-ivr" registered');
        
        // Start Queue Dispatcher
        if (!dispatcherInterval) {
            dispatcherInterval = setInterval(dispatchQueues, 2000);
        }
    } catch (err) {
        console.error('[ARI] Failed to connect:', err.message);
        // Retry after 5 seconds
        setTimeout(() => init(dbPool, socketIo), 5000);
    }
}

// ─── QUEUE DISPATCHER ────────────────────────────────────────────

async function getOrCreateBridge(campaignId) {
    if (campaignBridges.has(campaignId)) {
        return campaignBridges.get(campaignId);
    }
    try {
        const bridge = await ari.bridges.create({ type: 'holding', name: `queue_${campaignId}` });
        campaignBridges.set(campaignId, bridge.id);
        return bridge.id;
    } catch (err) {
        console.error(`[ARI] Failed to create bridge for campaign ${campaignId}:`, err.message);
        return null;
    }
}

async function dispatchQueues() {
    if (!ari) return;
    for (const [campaignId, waiters] of queueWaiters.entries()) {
        if (waiters.length === 0) continue;
        
        // Find ready agents for this campaign
        try {
            let assignedAgents = [];
            let agentExtensions = {};
            const pg = require('../config/pgDatabase');
            if (pg) {
                const res = await pg.query(`
                    SELECT ca.username, u.sip_extension 
                    FROM gescall_campaign_agents ca 
                    JOIN gescall_users u ON ca.username = u.username 
                    WHERE ca.campaign_id = $1
                `, [campaignId]);
                assignedAgents = res.rows.map(r => r.username);
                res.rows.forEach(r => {
                    agentExtensions[r.username] = r.sip_extension || r.username;
                });
            }

            const agentKeys = await redis.keys(`gescall:agent:*`);
            const readyAgents = [];
            for (const key of agentKeys) {
                const username = key.replace('gescall:agent:', '');
                // Check if agent is assigned to this campaign
                if (assignedAgents.length > 0 && !assignedAgents.includes(username)) continue;

                const stateMap = await redis.hGetAll(key);
                // Check if agent is READY
                if (stateMap.state === 'READY') {
                    readyAgents.push({
                        username,
                        lastChange: parseInt(stateMap.last_change || '0'),
                        sipExtension: agentExtensions[username] || username
                    });
                }
            }
            
            if (readyAgents.length === 0) continue;
            
            // RRMemory: sort by longest waiting (oldest last_change)
            readyAgents.sort((a, b) => a.lastChange - b.lastChange);
            const selectedAgent = readyAgents[0];
            
            // We have a waiter and an agent. 
            // Change agent state to prevent multiple calls
            await redis.hSet(`gescall:agent:${selectedAgent.username}`, 'state', 'RINGING');
            
            const waiter = waiters.shift();
            
            // Originate to agent
            console.log(`[Queue] Dispatching call ${waiter.channelId} to Agent ${selectedAgent.username} (Ext: ${selectedAgent.sipExtension})`);
            const endpoint = `PJSIP/${selectedAgent.sipExtension}`;
            
            const cId = waiter.phoneNumber || waiter.leadId || 'Desconocido';
            ari.channels.originate({
                endpoint,
                app: 'gescall-ivr',
                appArgs: 'dialed_agent',
                callerId: `"${cId}" <${cId}>`,
                variables: {
                    'waiter_channel': waiter.channelId,
                    'campaign_id': campaignId,
                    'agent_username': selectedAgent.username
                }
            }).catch(async err => {
                console.error(`[Queue] Failed to originate to ${selectedAgent.username}:`, err.message);
                await redis.hSet(`gescall:agent:${selectedAgent.username}`, 'state', 'READY');
                waiters.unshift(waiter); // Put back in queue
            });
            
        } catch (err) {
            console.error(`[Queue] Dispatch error for campaign ${campaignId}:`, err.message);
        }
    }
}

// ─── STASIS EVENT HANDLERS ───────────────────────────────────────

/**
 * Global ChannelStateChange
 * Updates Redis status so Go Dialer knows call is Ringing/Up
 */
async function handleGlobalChannelStateChange(event, channel) {
    try {
        if (!channel || !channel.id) return;
        const keys = await redis.keys(`gescall:call:*:${channel.id}`);
        if (keys && keys.length > 0) {
            await redis.hSet(keys[0], 'status', channel.state).catch(() => { });
        }
    } catch (err) {
        // ignore
    }
}

/**
 * Global ChannelDestroyed
 * Cleans up abandoned or completed outbound calls originated by Go
 */
async function handleGlobalChannelDestroyed(event, channel) {
    try {
        if (!channel || !channel.id) return;

        // Is this a Go Dialer call?
        const keys = await redis.keys(`gescall:call:*:${channel.id}`);
        if (!keys || keys.length === 0) return;

        const callKey = keys[0];
        const callData = await redis.hGetAll(callKey);

        if (callData && callData.lead_id) {
            let finalStatus, dtmf = '0', duration;
            let callAnswered = false;

            if (callData.ari_handled === 'YES') {
                finalStatus = callData.final_status || STATUS.HANGUP;
                dtmf = callData.final_dtmf || '0';
                duration = parseInt(callData.final_duration || '0');
                callAnswered = true;
            } else {
                const astState = callData.status || 'FAILED';
                finalStatus = fromAsteriskState(astState);
                if (astState === 'FAILED') finalStatus = STATUS.FAILED;
                duration = callData.start_time
                    ? Math.floor((Date.now() - parseInt(callData.start_time)) / 1000)
                    : 0;
            }

            const pg = require('../config/pgDatabase');
            const metrics = require('./metricsService');
            const webhooks = require('./webhookService');

            let leadStatusToSet = finalStatus;
            let incrementCalledCount = true;
            let newPhoneIndex = parseInt(callData.phone_index) || 0;

            const altPhoneEnabled = callData.alt_phone_enabled === 'true' || callData.alt_phone_enabled === '1' || callData.alt_phone_enabled === true;

            if (!callAnswered && altPhoneEnabled) {
                // Check if there are more alt phones
                try {
                    const { rows } = await pg.query(
                        `SELECT led.tts_vars, camp.lead_structure_schema 
                         FROM gescall_leads led 
                         JOIN gescall_lists ls ON led.list_id = ls.list_id 
                         JOIN gescall_campaigns camp ON ls.campaign_id = camp.campaign_id 
                         WHERE led.lead_id = $1`, 
                        [callData.lead_id]
                    );
                    
                    if (rows.length > 0) {
                        const l = rows[0];
                        const schema = typeof l.lead_structure_schema === 'string' ? JSON.parse(l.lead_structure_schema) : (l.lead_structure_schema || []);
                        const altPhoneCols = schema.filter(col => col.is_phone && col.name !== 'telefono').map(c => c.name);
                        
                        let altPhonesCount = 0;
                        if (l.tts_vars) {
                            const parsedVars = typeof l.tts_vars === 'string' ? JSON.parse(l.tts_vars) : l.tts_vars;
                            for (const col of altPhoneCols) {
                                if (parsedVars[col] && String(parsedVars[col]).replace(/[^0-9]/g, '').length >= 7) {
                                    altPhonesCount++;
                                }
                            }
                        }

                        if (newPhoneIndex < altPhonesCount) {
                            // There are more phones! Try next phone without counting as a full retry
                            leadStatusToSet = 'NEW';
                            incrementCalledCount = false;
                            newPhoneIndex++;
                        }
                    }
                } catch(e) {
                    console.error(`[ARI-Global] Error checking alt phones ${callData.lead_id}:`, e.message);
                }
            }

            // Parallel DB updates + Redis cleanup
            await Promise.all([
                pg.query(`
                    UPDATE gescall_leads 
                    SET status = $1, 
                        called_count = called_count + $2, 
                        last_call_time = NOW(),
                        phone_index = $3
                    WHERE lead_id = $4
                `, [leadStatusToSet, incrementCalledCount ? 1 : 0, newPhoneIndex, callData.lead_id]),
                pg.query(`
                    UPDATE gescall_call_log 
                    SET call_status = $1, call_duration = $2, dtmf_pressed = $3
                    WHERE lead_id = $4 AND call_status = '${STATUS.DIALING}'
                    AND call_date >= NOW() - INTERVAL '10 minutes'
                `, [finalStatus, duration, dtmf, callData.lead_id]),
                redis.del(callKey)
            ]);

            console.log(`[ARI-Global] ✓ lead=${callData.lead_id} ${finalStatus} ${duration}s dtmf=${dtmf} (from ChannelDestroyed)`);
            if (metrics.recordDuration) metrics.recordDuration(duration);
            if (webhooks.callCompleted) webhooks.callCompleted(callData.campaign_id, callData.lead_id, callData.phone_number, finalStatus, duration, dtmf);
        }
    } catch (e) {
        console.error(`[ARI-Global] Finalize error ${channel.id}:`, e.message);
    }
}

async function handleStasisStart(event, channel) {
    const channelId = channel.id;
    const callerIdName = channel.caller.name || '';
    const appArgs = event.args || [];
    console.log(`[ARI] StasisStart: channel=${channelId}, callerIdName=${callerIdName}, args=${JSON.stringify(appArgs)}`);

    // If this is a dialed/transfer channel, do NOT run IVR flow on it — just log it
    if (appArgs.includes('dialed')) {
        console.log(`[ARI] Dialed channel ${channelId} entered Stasis — skipping IVR flow`);
        return;
    }
    
    if (appArgs.includes('dialed_agent')) {
        // Agent answered the queue call! Bridge them with the waiting caller
        try {
            await channel.answer();
            
            try {
                // Wait 1 second for WebRTC audio path to fully open in the browser
                await new Promise(r => setTimeout(r, 1000));
                
                // Whisper: Play the new call audio to the agent
                const playback = ari.Playback();
                await channel.play({ media: 'sound:nueva_llamada' }, playback);
                await new Promise((resolve) => {
                    playback.on('PlaybackFinished', resolve);
                    setTimeout(resolve, 6000); // 6 seconds failsafe timeout
                });
            } catch(e) {
                console.error(`[Queue] Failed to play whisper to agent ${channelId}:`, e.message);
            }
            
            const waiterVar = await channel.getChannelVar({ variable: 'waiter_channel' });
            if (waiterVar && waiterVar.value) {
                const waiterChannelId = waiterVar.value;
                const mixingBridge = await ari.bridges.create({ type: 'mixing' });
                
                mixingBridge.on('ChannelLeftBridge', async (event) => {
                    console.log(`[Queue] Channel ${event.channel?.id} left bridge ${mixingBridge.id}, tearing down.`);
                    try { await ari.channels.hangup({ channelId: channelId }); } catch (e) {}
                    try { await ari.channels.hangup({ channelId: waiterChannelId }); } catch (e) {}
                    try { await ari.bridges.destroy({ bridgeId: mixingBridge.id }); } catch (e) {}
                });

                await mixingBridge.addChannel({ channel: [channelId, waiterChannelId] });
                console.log(`[Queue] Agent ${channelId} bridged with Waiter ${waiterChannelId}`);
                
                // Update agent state to ON_CALL
                const agentVar = await channel.getChannelVar({ variable: 'agent_username' });
                if (agentVar && agentVar.value) {
                    await redis.hSet(`gescall:agent:${agentVar.value}`, 'state', 'ON_CALL');
                }
            }
        } catch (err) {
            console.error(`[Queue] Agent answer error:`, err.message);
        }
        return;
    }

    try {
        // Answer the channel if not already answered
        try {
            if (channel.state !== 'Up') {
                await channel.answer();
            }
        } catch (e) {
            console.log(`[ARI] Channel ${channelId} answer skipped: ${e.message}`);
        }
        // Ensure TTS cache directory exists
        const pg = require('../config/pgDatabase');

        // Extract lead_id from callerIdName (V-string: V2172226020005160334 → 5160334)
        let leadId = 0;
        const vMatch = callerIdName.match(/^V\d{9,}(\d{7,})$/);
        if (vMatch) {
            leadId = parseInt(vMatch[1]);
        }

        // If no V-string, try to get from channel variable
        if (leadId === 0) {
            try {
                const varResult = await channel.getChannelVar({ variable: 'leadid' });
                if (varResult && varResult.value) leadId = parseInt(varResult.value);
            } catch (e) { /* variable not set */ }
        }

        console.log(`[ARI] Lead ID resolved: ${leadId}`);

        // Read pool CallerID from channel variable (__GESCALL_CID set by aleatorio_callerid.agi)
        let poolCallerid = '';
        try {
            const cidVar = await channel.getChannelVar({ variable: 'GESCALL_CID' });
            if (cidVar && cidVar.value) {
                poolCallerid = cidVar.value;
                console.log(`[ARI] Pool CallerID from channel var: ${poolCallerid}`);
            }
        } catch (e) { /* variable not set */ }

        // Determine if call is native to gescall (uses PostgreSQL)
        let isNative = process.env.USE_GESCALL_DIALER === 'true';
        try {
            const nativeVar = await channel.getChannelVar({ variable: 'GESCALL_NATIVE' });
            if (nativeVar && nativeVar.value === 'YES') {
                isNative = true;
                console.log(`[ARI] Call is explicitly native (PostgreSQL)`);
            } else if (nativeVar && nativeVar.value === 'NO') {
                isNative = false;
            }
        } catch (e) { /* variable not set */ }

        // Resolve campaign from lead
        let campaignId = '';
        let listId = 0;
        let firstName = '';
        let lastName = '';
        let vendorLeadCode = '';
        let state = '';
        let altPhone = '';
        let transferNumber = '';
        let comments = '';
        let campaignType = '';
        let phoneNumber = '';
        let customVars = {};

        try {
            const cTypeVar = await channel.getChannelVar({ variable: 'campaign_type' });
            if (cTypeVar && cTypeVar.value) campaignType = cTypeVar.value;
        } catch (e) { }

        // --- INBOUND DID LOOKUP ---
        if (appArgs.includes('inbound')) {
            const didNumber = appArgs[1] || channel.dialplan.exten || '';
            console.log(`[ARI] Inbound call received, looking up DID: ${didNumber}`);
            try {
                const pg = require('../config/pgDatabase');
                const didRes = await pg.query(
                    'SELECT campaign_id, trunk_id FROM gescall_inbound_dids WHERE did_number = $1 AND active = true LIMIT 1',
                    [didNumber]
                );
                if (didRes.rows.length > 0) {
                    campaignId = didRes.rows[0].campaign_id;
                    const didTrunkId = didRes.rows[0].trunk_id;
                    campaignType = 'INBOUND';
                    console.log(`[ARI] DID ${didNumber} mapped to Campaign ${campaignId}, Trunk ${didTrunkId}`);
                    if (didTrunkId) customVars['trunk_id'] = didTrunkId;
                } else {
                    console.log(`[ARI] DID ${didNumber} not found or inactive`);
                }
            } catch (err) {
                console.error(`[ARI] Error looking up DID ${didNumber}:`, err.message);
            }
        }

        if (leadId > 0 && !campaignId) {
            if (isNative) {
                try {
                    const pgRows = await pg.query(
                        `SELECT l.list_id, l.comments, l.phone_number, l.first_name, l.last_name,
                                l.vendor_lead_code, l.state, l.alt_phone, l.tts_vars, lst.campaign_id,
                                camp.trunk_id
                         FROM gescall_leads l
                         LEFT JOIN gescall_lists lst ON l.list_id = lst.list_id
                         LEFT JOIN gescall_campaigns camp ON lst.campaign_id = camp.campaign_id
                         WHERE l.lead_id = $1 LIMIT 1`, [leadId]
                    );

                    if (pgRows.rows.length > 0) {
                        const r = pgRows.rows[0];
                        listId = r.list_id;
                        campaignId = r.campaign_id || '';
                        comments = r.comments || '';
                        phoneNumber = r.phone_number || '';
                        firstName = r.first_name || '';
                        lastName = r.last_name || '';
                        vendorLeadCode = r.vendor_lead_code || '';
                        state = r.state || '';
                        altPhone = r.alt_phone || '';

                        // Load native custom variables from tts_vars
                        if (r.tts_vars && typeof r.tts_vars === 'object') {
                            customVars = { ...r.tts_vars };
                        }
                        if (r.trunk_id) customVars['trunk_id'] = r.trunk_id;
                    }

                    if (campaignId) {
                        const campRows = await pg.query(
                            `SELECT xferconf_c_number FROM gescall_campaigns WHERE campaign_id = $1 LIMIT 1`,
                            [campaignId]
                        );
                        if (campRows.rows.length > 0) {
                            transferNumber = (campRows.rows[0].xferconf_c_number || '').trim();
                        }
                    }
                } catch (err) {
                    console.error(`[ARI] Error resolving native lead ${leadId} from PostgreSQL:`, err.message);
                }
            } else if (db) {
                const [rows] = await db.execute(
                    `SELECT vl.list_id, vl.comments, vl.phone_number, vl.first_name, vl.last_name, 
                            vl.vendor_lead_code, vl.state, vl.alt_phone, vls.campaign_id
                     FROM vicidial_list vl
                     LEFT JOIN vicidial_lists vls ON vl.list_id = vls.list_id
                     WHERE vl.lead_id = ? LIMIT 1`, [leadId]
                );
                if (rows.length > 0) {
                    listId = rows[0].list_id;
                    campaignId = rows[0].campaign_id || '';
                    comments = rows[0].comments || '';
                    phoneNumber = rows[0].phone_number || '';
                    firstName = rows[0].first_name || '';
                    lastName = rows[0].last_name || '';
                    vendorLeadCode = rows[0].vendor_lead_code || '';
                    state = rows[0].state || '';
                    altPhone = rows[0].alt_phone || '';

                    // Load generic custom variables from vicidial_custom_$list_id
                    if (listId > 0) {
                        try {
                            const customTableName = `vicidial_custom_${listId}`;
                            const [customRows] = await db.execute(`SELECT * FROM ${customTableName} WHERE lead_id = ? LIMIT 1`, [leadId]);
                            if (customRows.length > 0) {
                                const customData = customRows[0];
                                for (const key in customData) {
                                    if (key !== 'lead_id') {
                                        customVars[key] = customData[key];
                                    }
                                }
                            }
                        } catch (e) {
                            // Silently ignore if the custom table doesn't exist for this list
                        }
                    }
                }

                // Get transfer number from campaign
                if (campaignId) {
                    const [campRows] = await db.execute(
                        `SELECT xferconf_c_number FROM vicidial_campaigns WHERE campaign_id = ? LIMIT 1`,
                        [campaignId]
                    );
                    if (campRows.length > 0) {
                        transferNumber = (campRows[0].xferconf_c_number || '').trim();
                    }
                }
            }
        }

        console.log(`[ARI] Campaign: ${campaignId}, Transfer: ${transferNumber}, Custom Vars: ${Object.keys(customVars).length}`);

        // Load IVR flow for campaign
        let flow = null;
        if (campaignId) {
            if (isNative) {
                const flowResult = await pg.query(
                    `SELECT flow_json FROM gescall_ivr_flows WHERE campaign_id = $1 AND is_active = true LIMIT 1`,
                    [campaignId]
                );
                if (flowResult.rows.length > 0) {
                    try {
                        flow = JSON.parse(flowResult.rows[0].flow_json);
                    } catch (e) {
                        console.error(`[ARI] Invalid flow JSON for campaign ${campaignId}`);
                    }
                }
            } else if (db) {
                const [flowRows] = await db.execute(
                    `SELECT flow_json FROM gescall_ivr_flows WHERE campaign_id = ? AND is_active = 1 LIMIT 1`,
                    [campaignId]
                );
                if (flowRows.length > 0) {
                    try {
                        flow = JSON.parse(flowRows[0].flow_json);
                    } catch (e) {
                        console.error(`[ARI] Invalid flow JSON for campaign ${campaignId}`);
                    }
                }
            }
        }

        // Store call state
        const stateObj = {
            channel,
            leadId,
            campaignId,
            listId,
            comments,
            transferNumber,
            poolCallerid,
            phone: phoneNumber,
            firstName,
            lastName,
            vendorLeadCode,
            state,
            altPhone,
            flow,
            dtmfBuffer: '',
            dtmfResolve: null, // Promise resolve for DTMF collection
            startTime: Date.now(),
            executionLog: [], // Keep track of node executions for n8n style view
            isNative, // Flag indicating if call uses PostgreSQL
            trunkId: customVars['trunk_id'] || null
        };

        // Attach custom properties as var_{PROPERTY} for replaceVars
        for (const [key, value] of Object.entries(customVars)) {
            if (value !== null && value !== undefined) {
                stateObj[`var_${key}`] = value;
            }
        }

        activeCalls.set(channelId, stateObj);

        // Emit live event
        if (io) {
            io.emit('ivr:call:start', { channelId, leadId, campaignId });
        }

        // Execute flow or Queue
        if (campaignType === 'OUTBOUND_PREDICTIVE' || campaignType === 'OUTBOUND_PROGRESSIVE' || campaignType === 'INBOUND') {
            // Direct to Queue Holding Bridge
            console.log(`[ARI] ${campaignType} call ${channelId} sending to Holding Bridge`);
            const bridgeId = await getOrCreateBridge(campaignId);
            if (bridgeId) {
                await ari.bridges.addChannel({ bridgeId, channel: channelId });
                if (!queueWaiters.has(campaignId)) queueWaiters.set(campaignId, []);
                queueWaiters.get(campaignId).push({ channelId, joinTime: Date.now(), leadId, phoneNumber: stateObj.phone || '' });
                // Optionally play MOH on channel
                try { await channel.play({ media: 'sound:default' }); } catch(e){}
            } else {
                await channel.hangup();
            }
        } else if (flow && flow.nodes && flow.edges) {
            await executeFlow(channelId, flow);
        } else {
            // Default flow: play TTS from comments, wait DTMF, transfer
            await executeDefaultFlow(channelId, comments, transferNumber);
        }
    } catch (err) {
        if (err.message && err.message.includes('Channel not found')) {
            console.log(`[ARI] Channel ${channelId} hung up before flow started.`);
        } else {
            console.error(`[ARI] Error in StasisStart:`, err.message);
        }
        try { await channel.hangup(); } catch (e) { /* already gone */ }

        // Ensure log is written even if promise chain is broken by early hangup
        const callState = activeCalls.get(channelId);
        if (callState) {
            logCallResult(callState);
            activeCalls.delete(channelId);
        }
    }
}

function handleStasisEnd(event, channel) {
    const channelId = channel.id;
    const callState = activeCalls.get(channelId);
    console.log(`[ARI] StasisEnd: channel=${channelId}`);

    if (callState) {
        // Mark as hung up FIRST — this propagates to executeFlow via the callState reference
        callState.hungUp = true;

        // Resolve any pending DTMF wait
        if (callState.dtmfResolve) {
            callState.dtmfResolve({ digit: null, hangup: true });
        }

        // Log to gescall_call_log
        logCallResult(callState);

        // Emit live event
        if (io) {
            io.emit('ivr:call:end', {
                channelId,
                leadId: callState.leadId,
                campaignId: callState.campaignId,
                dtmf: callState.dtmfBuffer,
                duration: Math.floor((Date.now() - callState.startTime) / 1000),
            });
        }

        // Remove from queue if it was waiting
        if (callState.campaignId && queueWaiters.has(callState.campaignId)) {
            const waiters = queueWaiters.get(callState.campaignId);
            const idx = waiters.findIndex(w => w.channelId === channelId);
            if (idx !== -1) waiters.splice(idx, 1);
        }

        activeCalls.delete(channelId);
    }
}

function handleDtmf(event, channel) {
    const channelId = channel.id;
    const digit = event.digit;
    const callState = activeCalls.get(channelId);

    console.log(`[ARI] DTMF: channel=${channelId}, digit=${digit}`);

    if (callState) {
        callState.dtmfBuffer += digit;

        if (io) {
            io.emit('ivr:dtmf', { channelId, digit, leadId: callState.leadId });
        }

        // Check if there is a waiting promise
        if (callState.dtmfResolve) {
            const resolve = callState.dtmfResolve;
            callState.dtmfResolve = null;
            // Clear the buffer after resolving, assuming it was consumed
            const currentBuffer = callState.dtmfBuffer;
            resolve({ digit, buffer: currentBuffer, hangup: false });
        }
    }
}

// ─── FLOW EXECUTOR ───────────────────────────────────────────────

async function executeNode(channelId, nodeId) {
    const callState = activeCalls.get(channelId);
    if (!callState || !callState.flow || !callState.flow.nodes) return { handle: null };

    const node = callState.flow.nodes.find(n => n.id === nodeId);
    if (!node) {
        console.error(`[ARI] Node ${nodeId} not found in flow`);
        return { handle: null };
    }

    console.log(`[ARI] Executing node: ${nodeId} (${node.type})`);

    // Broadcast active node to frontend tracking
    if (io) {
        io.emit('ivr:node_active', {
            channelId,
            nodeId,
            leadId: callState.leadId,
            campaignId: callState.campaignId
        });
    }

    const data = node.data || {};
    let result = { handle: null };
    const nodeStartTime = Date.now();

    // Log the execution of this node EARLY so if StasisEnd hits mid-execution, we capture it
    const logEntry = {
        nodeId,
        type: node.type,
        startTime: nodeStartTime,
        endTime: null,
        durationMs: null,
        result: null
    };
    callState.executionLog.push(logEntry);

    try {
        switch (node.type) {
            case 'play_tts':
                result = await nodePlayTTS(channelId, data);
                break;
            case 'play_audio':
                result = await nodePlayAudio(channelId, data);
                break;
            case 'collect_dtmf':
                result = await nodeCollectDTMF(channelId, data);
                break;
            case 'menu':
                result = await nodeMenu(channelId, data);
                break;
            case 'transfer':
                result = await nodeTransfer(channelId, data, callState);
                result = { handle: 'transfer' }; // Indicate transfer ends flow
                break;
            case 'hangup':
                await nodeHangup(channelId, data, callState);
                result = { handle: 'hangup' }; // Indicate hangup ends flow
                break;
            case 'set_variable':
                result = await nodeSetVariable(channelId, data, callState);
                break;
            case 'condition':
                result = await nodeCondition(channelId, data, callState);
                break;
            case 'http_request':
                result = await nodeHttpRequest(channelId, data, callState);
                break;
            default:
                console.warn(`[ARI] Unknown node type: ${node.type}`);
        }
    } catch (err) {
        console.error(`[ARI] Node ${node.id} error:`, err.message);
        result = { handle: 'error', error: err.message };
    }

    // Update the log entry when execution finishes
    logEntry.endTime = Date.now();
    logEntry.durationMs = logEntry.endTime - nodeStartTime;
    logEntry.result = result;

    return result;
}

async function executeFlow(channelId, flow) {
    const callState = activeCalls.get(channelId);
    if (!callState) return;

    const { nodes, edges } = flow;
    const nodeMap = new Map(nodes.map(n => [n.id, n]));
    const edgeMap = new Map();

    // Build edge lookup: sourceId -> [{ target, sourceHandle, label }]
    edges.forEach(e => {
        if (!edgeMap.has(e.source)) edgeMap.set(e.source, []);
        edgeMap.get(e.source).push(e);
    });

    // Find start node (node with no incoming edges)
    const targetIds = new Set(edges.map(e => e.target));
    let currentNodeId = nodes.find(n => !targetIds.has(n.id))?.id;

    if (!currentNodeId) {
        currentNodeId = nodes[0]?.id;
    }

    while (currentNodeId) {
        const node = nodeMap.get(currentNodeId);
        if (!node) break;

        // Check if channel is still alive or user hung up
        if (!activeCalls.has(channelId) || callState.hungUp) break;

        console.log(`[ARI] Executing node: ${node.id} (${node.type})`);

        // Emit live event
        if (io) {
            io.emit('ivr:node:execute', { channelId, nodeId: node.id, nodeType: node.type, leadId: callState.leadId });
        }

        const nodeStartTime = Date.now();
        const logEntry = {
            nodeId: node.id,
            type: node.type,
            startTime: nodeStartTime,
            endTime: null,
            durationMs: null,
            result: null
        };
        callState.executionLog.push(logEntry);

        let result = null;

        try {
            switch (node.type) {
                case 'play_tts':
                    result = await nodePlayTTS(channelId, node.data);
                    break;
                case 'play_audio':
                    result = await nodePlayAudio(channelId, node.data);
                    break;
                case 'collect_dtmf':
                    result = await nodeCollectDTMF(channelId, node.data);
                    break;
                case 'menu':
                    result = await nodeMenu(channelId, node.data);
                    break;
                case 'transfer':
                    result = await nodeTransfer(channelId, node.data, callState);
                    logEntry.endTime = Date.now();
                    logEntry.durationMs = logEntry.endTime - nodeStartTime;
                    logEntry.result = { handle: 'transfer' };
                    return; // Transfer ends the flow
                case 'hangup':
                    // Only mark as COMPLET if user hasn't hung up
                    if (!callState.hungUp) {
                        await nodeHangup(channelId, node.data, callState);
                    }
                    logEntry.endTime = Date.now();
                    logEntry.durationMs = logEntry.endTime - nodeStartTime;
                    logEntry.result = { handle: 'hangup' };
                    return;
                case 'set_variable':
                    result = await nodeSetVariable(channelId, node.data, callState);
                    break;
                case 'condition':
                    result = await nodeCondition(channelId, node.data, callState);
                    break;
                case 'http_request':
                    result = await nodeHttpRequest(channelId, node.data, callState);
                    break;
                default:
                    console.warn(`[ARI] Unknown node type: ${node.type}`);
            }
        } catch (err) {
            console.error(`[ARI] Node ${node.id} error:`, err.message);
            result = { handle: 'error', error: err.message };
            break;
        }

        logEntry.endTime = Date.now();
        logEntry.durationMs = logEntry.endTime - nodeStartTime;
        logEntry.result = result;

        // Find next node based on result
        const outEdges = edgeMap.get(currentNodeId) || [];
        let nextEdge = null;

        if (result && result.handle) {
            // Result specifies which handle to follow (e.g., dtmf-2, timeout)
            nextEdge = outEdges.find(e => e.sourceHandle === result.handle);
        }

        if (!nextEdge) {
            // Follow default edge (no handle or first edge)
            nextEdge = outEdges.find(e => !e.sourceHandle) || outEdges[0];
        }

        currentNodeId = nextEdge ? nextEdge.target : null;
    }

    // Flow ended without explicit hangup — hang up
    if (activeCalls.has(channelId)) {
        try {
            await callState.channel.hangup();
        } catch (e) { /* already gone */ }
    }
}

// ─── NODE IMPLEMENTATIONS ────────────────────────────────────────

async function nodePlayTTS(channelId, data) {
    const callState = activeCalls.get(channelId);
    if (!callState) return;

    const text = data.text || '';
    if (!text) return;

    // Replace dynamic variables in the text
    const replacedText = replaceVars(text, callState);
    console.log(`[ARI] Generating TTS for channel ${channelId}: "${replacedText}"`);

    // Generate audio file
    const audioFile = await generateTTS(replacedText);

    if (audioFile) {
        console.log(`[ARI] Playing generated TTS file: ${audioFile}`);
        // Play the generated sound file
        await nodePlayAudio(channelId, { filename: audioFile });
        // Add a small delay for natural pacing
        await sleep(500);
    } else {
        console.error(`[ARI] TTS generation failed for channel ${channelId}`);
    }
}

async function nodePlayAudio(channelId, data) {
    const callState = activeCalls.get(channelId);
    if (!callState) return;

    let filename = data.filename || '';
    if (!filename) return;

    // Asterisk sound playback expects filename without extension
    filename = filename.replace(/\.wav$/i, '');

    let playback, pb;
    try {
        playback = callState.channel.play({ media: `sound:${filename}` });
        pb = await playback;
    } catch (err) {
        if (err.message && err.message.includes('Channel not found')) {
            console.log(`[ARI] Client hung up before playback started for ${filename}`);
        } else {
            console.warn(`[ARI] Playback failed to start for ${filename}:`, err.message);
        }
        return;
    }

    await new Promise((resolve) => {
        let isResolved = false;

        const finish = (event, playbackInstance) => {
            if (isResolved) return;
            isResolved = true;

            // Playback 'failed' can mean caller hung up OR file issue — do NOT hangup here.
            // The StasisEnd handler already sets callState.hungUp = true on real hangups,
            // and the flow loop checks that flag before executing the next node.
            if (playbackInstance && playbackInstance.state === 'failed') {
                console.log(`[ARI] Playback finished with state=failed for ${filename} (channel ${channelId})`);
            }

            resolve();
        };

        pb.on('PlaybackFinished', finish);
        if (!activeCalls.has(channelId)) finish();

        // Race condition fallback: If playback is already done or channel hangs up silently
        // Check Asterisk playback state. Sometimes state is not immediately updated, 
        // so we also add a failsafe maximum timeout based on typical max audio duration (e.g. 60s).
        // For short audio, the event might have already fired before we attached the listener.
        setTimeout(() => {
            if (!isResolved) {
                console.warn(`[ARI] Playback fallback timeout triggered for channel ${channelId} playing ${filename}`);
                finish();
            }
        }, 65000); // 65 seconds maximum failsafe
    });
}

async function nodeCollectDTMF(channelId, data) {
    const callState = activeCalls.get(channelId);
    if (!callState) return { handle: 'timeout' };

    const timeout = (data.timeout || 10) * 1000;
    const maxRetries = data.maxRetries || 2;
    const validDigits = data.validDigits || '0123456789';

    for (let attempt = 0; attempt < maxRetries; attempt++) {
        // Clear DTMF buffer for this collection
        const result = await waitForDTMF(channelId, timeout);

        if (result.hangup) return { handle: 'hangup' };

        if (result.digit && validDigits.includes(result.digit)) {
            return { handle: `dtmf-${result.digit}`, digit: result.digit };
        }

        if (result.digit === null) {
            // Timeout
            if (attempt < maxRetries - 1) {
                // Play retry message if configured
                if (data.retryMessage) {
                    await nodePlayTTS(channelId, { text: data.retryMessage });
                }
            }
        } else {
            // Invalid digit
            if (data.invalidMessage) {
                await nodePlayTTS(channelId, { text: data.invalidMessage });
            }
        }
    }

    return { handle: 'timeout' };
}

async function nodeTransfer(channelId, data, callState) {
    if (!callState) return;

    const number = data.number || callState.transferNumber || '';
    const trunk = data.trunk || 'PJSIP/chock';
    const prefix = data.prefix || '';
    const overflowNumber = data.overflowNumber || '';
    const timeout = (data.timeout || 45) * 1000;

    if (!number) {
        console.error(`[ARI] Transfer: no number configured`);
        return;
    }

    // Play transfer message if configured
    if (data.message) {
        await nodePlayTTS(channelId, { text: data.message });
    }

    // Build dial string — use PJSIP SIP URI for SBC trunks
    let dialString;
    const sbcPrefix = process.env.SBC_PREFIX || '1122';
    const sbcHost = process.env.SBC_HOST || '190.242.45.3';
    const sbcPort = process.env.SBC_PORT || '5060';
    if (trunk.startsWith('PJSIP/')) {
        const endpoint = trunk.replace('PJSIP/', '');
        dialString = `PJSIP/${endpoint}/sip:${sbcPrefix}${prefix}${number}@${sbcHost}:${sbcPort}`;
    } else {
        dialString = `${trunk}/${prefix}${number}`;
    }
    console.log(`[ARI] Transferring to ${dialString}`);

    try {
        // Mark call outcome as transfer
        callState.callOutcome = IVR_OUTCOME.TRANSFERRED;

        // Update lead status
        if (callState.leadId > 0) {
            if (callState.isNative) {
                const pg = require('../config/pgDatabase');
                await pg.query(
                    `UPDATE gescall_leads SET status='XFER' WHERE lead_id=$1`,
                    [callState.leadId]
                ).catch(e => console.error('[ARI] PG Update XFER error:', e.message));
            } else if (db) {
                await db.execute(
                    `UPDATE vicidial_list SET status='XFER' WHERE lead_id=?`,
                    [callState.leadId]
                ).catch(e => console.error('[ARI] MySQL Update XFER error:', e.message));
            }
        }

        // Create a mixing bridge and add the original caller
        const bridge = ari.Bridge();
        await bridge.create({ type: 'mixing' });
        await bridge.addChannel({ channel: channelId });
        console.log(`[ARI] Bridge created, original caller added`);

        // Start Music on Hold on the caller while transfer destination is ringing
        try {
            await callState.channel.startMoh();
            console.log(`[ARI] MOH started on caller channel`);
        } catch (e) {
            console.warn(`[ARI] Could not start MOH:`, e.message);
        }

        // Track the dialed channel (transfer destination)
        const dialedChannelId = await new Promise((resolve, reject) => {
            const dialTimeout = setTimeout(() => {
                reject(new Error('Transfer dial timeout — no answer'));
            }, timeout);

            const dialed = ari.Channel();

            dialed.on('ChannelDestroyed', async (ev, ch) => {
                clearTimeout(dialTimeout);
                console.log(`[ARI] Transfer target hung up`);
                // Stop MOH on caller
                try { await callState.channel.stopMoh(); } catch (e) { }
                try { await bridge.destroy(); } catch (e) { }
                // Reject the promise so that the transfer loop isn't stuck forever, freeing the channel
                reject(new Error('Transfer target hung up'));

                // If original caller is still around, try overflow or hangup
                if (activeCalls.has(channelId)) {
                    if (overflowNumber) {
                        console.log(`[ARI] Attempting overflow to ${trunk}/${prefix}${overflowNumber}`);
                        try {
                            await nodeTransfer(channelId, {
                                number: overflowNumber,
                                trunk,
                                prefix,
                                message: data.message || '',
                                timeout: data.timeout || 45,
                            }, callState);
                        } catch (e2) {
                            try { await callState.channel.hangup(); } catch (e3) { }
                        }
                    } else {
                        try { await callState.channel.hangup(); } catch (e) { }
                    }
                }
            });

            dialed.on('StasisStart', async (ev, dialedChannel) => {
                clearTimeout(dialTimeout);
                console.log(`[ARI] Transfer target ${dialedChannel.id} answered — stopping MOH and adding to bridge`);
                try {
                    // Stop MOH before bridging so both parties can talk
                    try { await callState.channel.stopMoh(); } catch (e) { }
                    await bridge.addChannel({ channel: dialedChannel.id });
                    console.log(`[ARI] Both channels now bridged`);
                    resolve(dialedChannel.id);
                } catch (e) {
                    console.error(`[ARI] Failed to add dialed channel to bridge:`, e.message);
                    reject(e);
                }
            });

            // Originate the transfer call with the lead's phone as CallerID
            const transferCallerId = callState.phone || callState.callerIdNum || '';
            dialed.originate({
                endpoint: dialString,
                app: 'gescall-ivr',
                appArgs: 'dialed',
                callerId: transferCallerId ? `${transferCallerId} <${transferCallerId}>` : undefined,
            }).catch(err => {
                clearTimeout(dialTimeout);
                reject(err);
            });
        });

        // Also handle original caller hanging up — clean up the bridge
        const origDestroyHandler = async () => {
            console.log(`[ARI] Original caller hung up during transfer`);
            try { const ch = ari.Channel(dialedChannelId); await ch.hangup(); } catch (e) { }
            try { await bridge.destroy(); } catch (e) { }
        };
        callState.channel.once('ChannelDestroyed', origDestroyHandler);

        // Log transfer
        if (db && callState.leadId > 0) {
            callState.transferredTarget = dialString;
            await logToGescall(callState, 'XFER', callState.dtmfBuffer);
        }

        // Emit event
        if (io) {
            io.emit('ivr:transfer', { channelId, leadId: callState.leadId, number, trunk, prefix });
        }
    } catch (err) {
        console.error(`[ARI] Transfer failed:`, err.message);
        // On failure, try overflow number
        if (overflowNumber && overflowNumber !== number) {
            console.log(`[ARI] Primary transfer failed, trying overflow: ${overflowNumber}`);
            try {
                await nodeTransfer(channelId, {
                    number: overflowNumber,
                    trunk,
                    prefix,
                    message: '',
                    timeout: data.timeout || 45,
                }, callState);
            } catch (e2) {
                try { await callState.channel.hangup(); } catch (e3) { }
            }
        } else {
            try { await callState.channel.hangup(); } catch (e) { }
        }
    }
}

async function nodeHangup(channelId, data, callState) {
    if (!callState) return;

    // Play goodbye message if configured
    if (data && data.message) {
        await nodePlayTTS(channelId, { text: data.message });
    }

    // Mark call outcome as flow-completed (not user hangup)
    // For the call log: COMPLET = IVR completed normally
    // For the lead status: use the node's configured status (default COMPLET)
    const status = data?.status || STATUS.COMPLET;
    callState.callOutcome = IVR_OUTCOME.COMPLETED; // COMPLET
    if (callState.leadId > 0) {
        if (callState.isNative) {
            const pg = require('../config/pgDatabase');
            await pg.query(
                `UPDATE gescall_leads SET status=$1 WHERE lead_id=$2`,
                [status, callState.leadId]
            ).catch(e => console.error('[ARI] PG Update Hangup error:', e.message));
        } else if (db) {
            await db.execute(
                `UPDATE vicidial_list SET status=? WHERE lead_id=?`,
                [status, callState.leadId]
            ).catch(e => console.error('[ARI] MySQL Update Hangup error:', e.message));
        }
    }

    try {
        await callState.channel.hangup();
    } catch (e) { /* already gone */ }
}

async function nodeSetVariable(channelId, data, callState) {
    if (!callState) return;
    if (data.name && data.value) {
        callState[`var_${data.name}`] = data.value;
    }
}

async function nodeCondition(channelId, data, callState) {
    if (!callState) return { handle: 'false' };

    const variable = data.variable || '';
    let value = '';

    // Resolve variable
    if (variable === 'dtmf') value = callState.dtmfBuffer;
    else if (variable === 'comments') value = callState.comments;
    else if (variable === 'campaign_id') value = callState.campaignId;
    else value = callState[`var_${variable}`] || '';

    const operator = data.operator || 'equals';
    const compareValue = data.value || '';

    let result = false;
    // numeric comparison logic
    const valFloat = parseFloat(value);
    const compFloat = parseFloat(compareValue);
    const isNum = !isNaN(valFloat) && !isNaN(compFloat);

    switch (operator) {
        case 'equals': result = value === compareValue; break;
        case 'not_equals': result = value !== compareValue; break;
        case 'contains': result = value.includes(compareValue); break;
        case 'not_empty': result = value.trim() !== ''; break;
        case 'empty': result = value.trim() === ''; break;
        case 'greater_than': result = isNum && (valFloat > compFloat); break;
        case 'less_than': result = isNum && (valFloat < compFloat); break;
    }

    return { handle: result ? 'true' : 'false' };
}

async function nodeMenu(channelId, data) {
    const callState = activeCalls.get(channelId);
    if (!callState) return { handle: 'timeout' };

    const audioType = data.audioType || 'TTS';
    const text = data.text || '';
    let filename = data.filename || '';
    const timeout = (data.timeout || 10) * 1000;
    const maxRetries = data.maxRetries || 2;
    const validDigits = data.validDigits || '123';
    const interruptible = data.interruptible !== false; // default true

    let audioFileToPlay = '';

    if (audioType === 'TTS' && text) {
        const replacedText = replaceVars(text, callState);
        audioFileToPlay = await generateTTS(replacedText);
    } else if (audioType === 'Audio' && filename) {
        audioFileToPlay = filename.replace(/\.wav$/i, '');
    }

    for (let attempt = 0; attempt < maxRetries; attempt++) {
        // Clear dtmf buffer for this attempt to capture clean barge-in
        callState.dtmfBuffer = '';

        if (audioFileToPlay) {
            let playback, pb;
            try {
                playback = callState.channel.play({ media: `sound:${audioFileToPlay}` });
                pb = await playback;
            } catch (err) {
                if (!err.message?.includes('Channel not found')) {
                    console.warn(`[ARI] Menu playback failed:`, err.message);
                }
            }

            if (pb) {
                await new Promise((resolve) => {
                    let isResolved = false;

                    const finish = () => {
                        if (isResolved) return;
                        isResolved = true;
                        if (callState.channel && callState.channel.removeListener) {
                            callState.channel.removeListener('ChannelDtmfReceived', onDtmf);
                        }
                        resolve();
                    };

                    const onDtmf = (event) => {
                        if (isResolved) return;
                        if (interruptible) {
                            if (validDigits.includes(event.digit)) {
                                console.log(`[ARI] Menu barge-in valid digit: ${event.digit}, stopping playback`);
                                pb.stop().catch(() => {});
                                finish();
                            }
                        }
                    };

                    pb.on('PlaybackFinished', finish);
                    callState.channel.on('ChannelDtmfReceived', onDtmf);
                    if (!activeCalls.has(channelId)) finish();

                    setTimeout(() => { if (!isResolved) finish(); }, 65000);
                });
            }
        }

        // After playback, check if we collected a digit via the global handler into dtmfBuffer
        let collectedDigit = null;
        if (callState.dtmfBuffer) {
            collectedDigit = callState.dtmfBuffer.slice(-1); // get last pressed
        }

        if (collectedDigit && validDigits.includes(collectedDigit)) {
            return { handle: `dtmf-${collectedDigit}`, digit: collectedDigit };
        } else if (collectedDigit) {
            // Invalid digit pressed during playback
            if (data.invalidMessage) {
                // Clear buffer again so waitForDTMF doesn't instantly return this invalid digit
                callState.dtmfBuffer = '';
                await nodePlayTTS(channelId, { text: data.invalidMessage });
            }
            continue; // Go to next attempt
        }

        // If no digit intercepted during playback, wait normally
        const result = await waitForDTMF(channelId, timeout);

        if (result.hangup) return { handle: 'hangup' };

        if (result.digit && validDigits.includes(result.digit)) {
            return { handle: `dtmf-${result.digit}`, digit: result.digit };
        }

        if (attempt < maxRetries - 1) {
            // Clear buffer again
            callState.dtmfBuffer = '';
            
            if (result.digit === null && data.retryMessage) {
                await nodePlayTTS(channelId, { text: data.retryMessage });
            } else if (result.digit !== null && data.invalidMessage) {
                await nodePlayTTS(channelId, { text: data.invalidMessage });
            }
        }
    }

    return { handle: 'timeout' };
}

async function nodeHttpRequest(channelId, data, callState) {
    if (!callState) return;

    let urlStr = data.url || '';
    const method = (data.method || 'GET').toUpperCase();
    const bodyStr = data.body || '';
    const headersStr = data.headers || '';
    const paramsStr = data.params || '';

    if (!urlStr) {
        console.error(`[ARI] HTTP Request node missing URL`);
        return;
    }

    // Helper to deeply replace variables in JSON objects safely
    const traverseAndReplace = (obj) => {
        if (typeof obj === 'string') {
            return replaceVars(obj, callState);
        } else if (Array.isArray(obj)) {
            return obj.map(item => traverseAndReplace(item));
        } else if (obj !== null && typeof obj === 'object') {
            const newObj = {};
            for (const [key, val] of Object.entries(obj)) {
                newObj[key] = traverseAndReplace(val);
            }
            return newObj;
        }
        return obj;
    };

    try {
        // 1. Process Query Params
        if (paramsStr) {
            try {
                // Parse the raw template JSON first, then replace variables in the values
                const paramsObjTemplate = JSON.parse(paramsStr);
                const paramsObj = traverseAndReplace(paramsObjTemplate);
                const queryParams = new URLSearchParams(paramsObj).toString();
                if (queryParams) {
                    urlStr += (urlStr.includes('?') ? '&' : '?') + queryParams;
                }
            } catch (e) {
                console.warn(`[ARI] HTTP Request node failed to parse params JSON:`, e.message);
            }
        }

        // 2. Replace variables in the final URL
        const finalUrl = encodeURI(replaceVars(urlStr, callState));

        console.log(`[ARI] Executing HTTP ${method} to ${finalUrl}`);

        const parsedUrl = new URL(finalUrl);
        const httplib = parsedUrl.protocol === 'https:' ? require('https') : require('http');

        const options = {
            hostname: parsedUrl.hostname,
            port: parsedUrl.port || (parsedUrl.protocol === 'https:' ? 443 : 80),
            path: parsedUrl.pathname + parsedUrl.search,
            method: method,
            headers: {},
            timeout: 10000 // 10 seconds timeout
        };

        // 3. Process custom Headers
        if (headersStr) {
            try {
                const headersObjTemplate = JSON.parse(headersStr);
                const headersObj = traverseAndReplace(headersObjTemplate);
                options.headers = { ...options.headers, ...headersObj };
            } catch (e) {
                console.warn(`[ARI] HTTP Request node failed to parse headers JSON:`, e.message);
            }
        }

        // 4. Process Body
        let requestBody = null;
        if (method === 'POST' || method === 'PUT' || method === 'PATCH' || method === 'DELETE') {
            if (!options.headers['Content-Type']) {
                options.headers['Content-Type'] = 'application/json';
            }

            if (bodyStr) {
                try {
                    // If it's intended to be JSON, safely interpolate
                    if (options.headers['Content-Type'].includes('application/json')) {
                        const bodyObjTemplate = JSON.parse(bodyStr);
                        const bodyObj = traverseAndReplace(bodyObjTemplate);
                        requestBody = JSON.stringify(bodyObj);
                    } else {
                        // Raw text body
                        requestBody = replaceVars(bodyStr, callState);
                    }
                } catch (e) {
                    // Fallback to raw string replacement if JSON parse of template fails
                    console.warn(`[ARI] HTTP Body template is not valid JSON, falling back to raw replace`);
                    requestBody = replaceVars(bodyStr, callState);
                }
                options.headers['Content-Length'] = Buffer.byteLength(requestBody);
            }
        }

        // Use Promise to await completion so flow pauses here
        await new Promise((resolve) => {
            const req = httplib.request(options, (res) => {
                let resData = '';
                res.on('data', chunk => resData += chunk);
                res.on('end', () => {
                    console.log(`[ARI] HTTP Request returned ${res.statusCode}: ${resData.substring(0, 150)}`);

                    // Try to parse JSON and store fields in callState
                    try {
                        let parsed = JSON.parse(resData);

                        // If it's an array, try to extract variables from the first object
                        if (Array.isArray(parsed) && parsed.length > 0) {
                            parsed = parsed[0];
                        }

                        if (parsed && typeof parsed === 'object') {
                            for (const [key, val] of Object.entries(parsed)) {
                                if (typeof val !== 'object' && val !== null) {
                                    callState[`var_api_${key}`] = val; // Store as var_api_{key}
                                }
                            }
                            console.log(`[ARI] Extracted HTTP variables to callState: api_...`);
                        }
                    } catch (e) {
                        // Not JSON or parse error, ignore
                    }

                    resolve();
                });
            });

            req.on('error', (err) => {
                console.error(`[ARI] HTTP Request error: ${err.message}`);
                resolve(); // resolve anyway to continue flow
            });

            req.on('timeout', () => {
                req.destroy();
                console.error(`[ARI] HTTP Request timed out`);
                resolve();
            });

            if (requestBody) {
                req.write(requestBody);
            }
            req.end();
        });

    } catch (err) {
        console.error(`[ARI] Error in HTTP node:`, err.message);
    }
}

// ─── DEFAULT FLOW (FALLBACK) ─────────────────────────────────────

async function executeDefaultFlow(channelId, comments, transferNumber) {
    const callState = activeCalls.get(channelId);
    if (!callState) return;

    // Play beep
    try {
        const pb = await callState.channel.play({ media: 'sound:beep' });
        await new Promise(r => { pb.on('PlaybackFinished', r); });
        await sleep(500);
    } catch (e) { }

    // Play TTS from comments
    if (comments) {
        await nodePlayTTS(channelId, { text: comments });
    }

    // Wait for DTMF
    const result = await nodeCollectDTMF(channelId, {
        timeout: 10,
        maxRetries: 2,
        validDigits: '0123456789',
        retryMessage: 'No detectamos ninguna entrada. Por favor intente nuevamente.',
        invalidMessage: 'Opción no válida. Por favor marque una opción válida para hablar con un asesor.',
    });

    if (result.digit !== null && transferNumber) {
        await nodeTransfer(channelId, {
            number: transferNumber,
            message: 'En breve será atendido por uno de nuestros asesores. Por favor espere.',
        }, callState);
    } else {
        await nodeHangup(channelId, {
            message: 'Gracias por llamar. Hasta luego.',
            status: 'COMPLET',
        }, callState);
    }
}

// ─── HELPERS ─────────────────────────────────────────────────────

// Replace variables helper
function replaceVars(templateStr, callState) {
    if (!templateStr) return '';

    // Replacement logic shared between single and double brace matches
    const resolve = (varName) => {
        let cleanVar = varName.trim().toLowerCase();

        // Standard field mappings (English + Spanish aliases)
        switch (cleanVar) {
            case 'lead_id': return String(callState.leadId);
            case 'campaign_id': return callState.campaignId || '';
            case 'first_name':
            case 'nombre': return callState.firstName || '';
            case 'last_name':
            case 'apellido': return callState.lastName || '';
            case 'vendor_lead_code': return callState.vendorLeadCode || '';
            case 'state': return callState.state || '';
            case 'phone':
            case 'telefono':
            case 'phone_number': return callState.phone || '';
            case 'alt_phone': return callState.altPhone || '';
            case 'comments':
            case 'comentarios': return callState.comments || '';
            case 'dtmf': return callState.dtmfBuffer || '';
        }

        // Custom variables from tts_vars (var_XXXX)
        if (callState[`var_${cleanVar}`] !== undefined) {
            return String(callState[`var_${cleanVar}`]);
        }
        // Also try original case
        if (callState[`var_${varName.trim()}`] !== undefined) {
            return String(callState[`var_${varName.trim()}`]);
        }
        return null; // not found
    };

    // Pass 1: Replace {{variable}} (double braces)
    let result = templateStr.replace(/\{\{([^}]+)\}\}/g, (match, varName) => {
        const val = resolve(varName);
        return val !== null ? val : match;
    });

    // Pass 2: Replace {variable} (single braces) — only if not already consumed by double brace
    result = result.replace(/\{([^{}]+)\}/g, (match, varName) => {
        const val = resolve(varName);
        return val !== null ? val : match;
    });

    return result;
}

function waitForDTMF(channelId, timeout) {
    return new Promise((resolve) => {
        const callState = activeCalls.get(channelId);
        if (!callState) {
            resolve({ digit: null, buffer: '', hangup: true });
            return;
        }

        // If there's already a buffered digit, consume it immediately
        if (callState.dtmfBuffer && callState.dtmfBuffer.length > 0) {
            const buffer = callState.dtmfBuffer;
            const lastDigit = buffer[buffer.length - 1];
            resolve({ digit: lastDigit, buffer: buffer, hangup: false });
            // Note: we leave it in the buffer for general tracking
            return;
        }

        const timer = setTimeout(() => {
            if (callState.dtmfResolve === resolve) {
                callState.dtmfResolve = null;
            }
            resolve({ digit: null, buffer: callState.dtmfBuffer, hangup: false });
        }, timeout);

        callState.dtmfResolve = (result) => {
            clearTimeout(timer);
            resolve(result);
        };
    });
}

async function generateTTS(text) {
    const hash = crypto.createHash('md5').update(text + '_ari_v1').digest('hex');
    const slinPath = `${TTS_CACHE}/${hash}.sln`;

    // Check cache
    if (fs.existsSync(slinPath)) {
        return `tts/piper/${hash}`;
    }

    // Optimización Gescall: Keep-Alive Agent para evitar overhead TCP
    if (!global._ttsKeepAliveAgentHttp) {
        const http = require('http');
        global._ttsKeepAliveAgentHttp = new http.Agent({
            keepAlive: true,
            keepAliveMsecs: 10000,
            maxSockets: 2000,
            maxFreeSockets: 500
        });
    }
    if (!global._ttsKeepAliveAgentHttps) {
        const https = require('https');
        global._ttsKeepAliveAgentHttps = new https.Agent({
            keepAlive: true,
            keepAliveMsecs: 10000,
            maxSockets: 2000,
            maxFreeSockets: 500
        });
    }

    let ttsUrl = process.env.PIPER_TTS_URL;

    // In-memory cache for TTS nodes to avoid DB queries on every high-CPS call
    if (!global._cachedTtsNodes || Date.now() - global._cachedTtsNodesTime > 60000) {
        try {
            const isNative = process.env.USE_GESCALL_DIALER === 'true';
            let nodes = [];
            if (isNative) {
                const pg = require('../config/pgDatabase');
                const result = await pg.query('SELECT url FROM gescall_tts_nodes WHERE is_active = true');
                nodes = result.rows;
            } else if (db) {
                const [rows] = await db.execute('SELECT url FROM gescall_tts_nodes WHERE is_active = TRUE');
                nodes = rows;
            }

            if (nodes && nodes.length > 0) {
                global._cachedTtsNodes = nodes;
                global._cachedTtsNodesTime = Date.now();
            } else {
                global._cachedTtsNodes = [];
                global._cachedTtsNodesTime = Date.now();
            }
        } catch (err) {
            console.warn('[ARI] Error fetching TTS nodes from DB, falling back to ENV:', err.message);
        }
    }

    if (global._cachedTtsNodes && global._cachedTtsNodes.length > 0) {
        const randIdx = Math.floor(Math.random() * global._cachedTtsNodes.length);
        ttsUrl = global._cachedTtsNodes[randIdx].url;
    }

    // Generate via Piper API
    try {
        const data = JSON.stringify({ text, format: "wav" });

        const response = await new Promise((resolve, reject) => {
            const url = new URL(ttsUrl);
            const isHttps = url.protocol === 'https:';
            const reqLib = isHttps ? require('https') : require('http');
            const agent = isHttps ? global._ttsKeepAliveAgentHttps : global._ttsKeepAliveAgentHttp;

            let isDone = false;

            // Failsafe timeout at the Promise level (protects against Agent queue deadlocks)
            const absoluteTimeout = setTimeout(() => {
                if (isDone) return;
                isDone = true;
                req.destroy(); // Cancelar conexión física
                reject(new Error('TTS Absolute timeout (Queue full or API stuck)'));
            }, 60000); // 60s timeout for heavy concurrent queues

            const req = reqLib.request({
                hostname: url.hostname,
                port: url.port || (isHttps ? 443 : 80),
                path: url.pathname + url.search,
                method: 'POST',
                agent: agent,
                headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) },
                timeout: 45000, // Socket inactivity timeout is huge to wait for Python queue
            }, (res) => {
                const chunks = [];
                res.on('data', chunk => chunks.push(chunk));
                res.on('end', () => {
                    if (isDone) return;
                    isDone = true;
                    clearTimeout(absoluteTimeout);
                    resolve({ status: res.statusCode, data: Buffer.concat(chunks) });
                });
            });
            req.on('error', (err) => {
                if (isDone) return;
                isDone = true;
                clearTimeout(absoluteTimeout);
                reject(err);
            });
            req.on('timeout', () => {
                req.destroy();
                // Error emitted by destroy will be caught by req.on('error') but we can handle exactly here:
                if (!isDone) {
                    isDone = true;
                    clearTimeout(absoluteTimeout);
                    reject(new Error('TTS socket inactivity timeout'));
                }
            });
            req.write(data);
            req.end();
        });

        if (response.status === 200 && response.data.length > 0) {
            // WAV→SLN conversion via sox pipe (stdin→stdout, zero temp files)
            try {
                const sln = execSync(
                    'sox -t wav - -t raw -r 8000 -e signed-integer -b 16 -c 1 -',
                    { input: response.data, timeout: 10000, maxBuffer: 10 * 1024 * 1024 }
                );
                fs.writeFileSync(slinPath, sln);
            } catch (soxErr) {
                console.error(`[ARI] sox WAV→SLN pipe failed: ${soxErr.message}`);
                return null;
            }
            return `tts/piper/${hash}`;
        } else {
            console.error(`[ARI] TTS generation API failure: url=${ttsUrl}, status=${response.status}, dataLen=${response.data?.length}, msg=${response.data?.toString('utf8').slice(0, 200)}`);
        }
    } catch (err) {
        console.error(`[ARI] TTS generation failed: ${err.message}`);
    }

    return null;
}

async function logCallResult(callState) {
    try {
        const duration = Math.floor((Date.now() - callState.startTime) / 1000);
        // Determine call outcome:
        //   - XFER: call was transferred (set by nodeTransfer)
        //   - COMPLET: IVR flow completed normally via hangup node (set by nodeHangup)
        //   - HANGUP: user hung up during IVR (callOutcome is undefined)
        let status;
        if (callState.callOutcome) {
            status = callState.callOutcome; // COMPLET, XFER, or custom
        } else {
            status = IVR_OUTCOME.USER_HANGUP; // HANGUP — user hung up
        }

        // Write the semantic outcome to Redis so ChannelDestroyed can use it
        // ChannelDestroyed is the SINGLE writer to both gescall_leads and gescall_call_log
        const channelId = callState.channel?.id;
        if (channelId) {
            try {
                // Find the campaign-scoped call key (format: gescall:call:CAMPAIGN:channelId)
                const callKeys = await redis.keys(`gescall:call:*:${channelId}`);
                const callKey = callKeys && callKeys.length > 0 ? callKeys[0] : `gescall:call:${channelId}`;
                await redis.hSet(callKey, {
                    final_status: status,
                    final_dtmf: callState.dtmfBuffer || '0',
                    final_duration: String(duration),
                    ari_handled: 'YES'
                });
            } catch (e) {
                console.error(`[ARI] Failed to write outcome to Redis:`, e.message);
            }
        }

        console.log(`[ARI] Call outcome: lead=${callState.leadId}, status=${status}, dtmf=${callState.dtmfBuffer}, duration=${duration}s`);

        // Log full IVR execution path (n8n style) — this is unique to ariService
        if (callState.campaignId && callState.executionLog && callState.executionLog.length > 0) {
            const finishedAt = new Date().toISOString().slice(0, 19).replace('T', ' ');
            const startedAt = new Date(callState.startTime).toISOString().slice(0, 19).replace('T', ' ');

            try {
                if (callState.isNative) {
                    const pg = require('../config/pgDatabase');
                    await pg.query(`
                        INSERT INTO gescall_ivr_executions 
                        (campaign_id, lead_id, channel_id, started_at, finished_at, duration_ms, status, execution_data)
                        VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
                    `, [
                        callState.campaignId,
                        callState.leadId || 0,
                        channelId || '',
                        startedAt,
                        finishedAt,
                        Date.now() - callState.startTime,
                        status,
                        JSON.stringify(callState.executionLog)
                    ]);
                } else if (db) {
                    await db.execute(`
                        INSERT INTO gescall_ivr_executions 
                        (campaign_id, lead_id, channel_id, started_at, finished_at, duration_ms, status, execution_data)
                        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                    `, [
                        callState.campaignId,
                        callState.leadId || 0,
                        channelId || '',
                        startedAt,
                        finishedAt,
                        Date.now() - callState.startTime,
                        status,
                        JSON.stringify(callState.executionLog)
                    ]);
                }
                console.log(`[ARI] Saved IVR executions to DB`);
            } catch (dbErr) {
                console.error(`[ARI] Failed to insert executions:`, dbErr.message);
            }
        }
    } catch (err) {
        console.error(`[ARI] Log error:`, err.message);
    }
}

async function logToGescall(callState, status, dtmf, duration) {
    // Normalize raw Asterisk channel states using centralized mapping
    status = fromAsteriskState(status) !== STATUS.DROP ? fromAsteriskState(status) : status;

    if (callState.leadId <= 0) return;
    if (!callState.isNative && !db) return;
    duration = duration || Math.floor((Date.now() - callState.startTime) / 1000);

    try {
        let phone = callState.phone || '';
        let vlc = callState.vendorLeadCode || '';
        let poolCid = callState.poolCallerid || '';

        // If not native, do fallback queries on MySQL
        if (!callState.isNative) {
            if (!phone || !vlc) {
                const [leadRows] = await db.execute(
                    `SELECT phone_number, vendor_lead_code FROM vicidial_list WHERE lead_id = ? LIMIT 1`,
                    [callState.leadId]
                );
                if (!phone && leadRows.length > 0) phone = leadRows[0].phone_number;
                if (!vlc && leadRows.length > 0) vlc = leadRows[0].vendor_lead_code;
            }

            if (!poolCid) {
                try {
                    const [cidRows] = await db.execute(
                        `SELECT callerid_used FROM gescall_callerid_usage_log WHERE lead_id = ? ORDER BY created_at DESC LIMIT 1`,
                        [callState.leadId]
                    );
                    if (cidRows.length > 0) poolCid = cidRows[0].callerid_used || '';
                } catch (e) { /* table may not exist */ }
            }

            if (!poolCid) {
                try {
                    const [existRows] = await db.execute(
                        `SELECT pool_callerid FROM gescall_call_log WHERE lead_id = ? AND pool_callerid IS NOT NULL AND pool_callerid != '' ORDER BY call_date DESC LIMIT 1`,
                        [callState.leadId]
                    );
                    if (existRows.length > 0) poolCid = existRows[0].pool_callerid || '';
                } catch (e) { /* ignore */ }
            }

            if (!poolCid) {
                try {
                    const [dlRows] = await db.execute(
                        `SELECT caller_code FROM vicidial_dial_log WHERE lead_id = ? AND caller_code IS NOT NULL AND caller_code != '' ORDER BY call_date DESC LIMIT 1`,
                        [callState.leadId]
                    );
                    if (dlRows.length > 0) poolCid = dlRows[0].caller_code || '';
                } catch (e) { /* ignore */ }
            }
        }

        console.log(`[ARI] Logging call: lead=${callState.leadId}, status=${status}, poolCid=${poolCid}, isNative=${callState.isNative}`);

        if (callState.isNative) {
            const pg = require('../config/pgDatabase');
            const pgUpdateResult = await pg.query(
                `UPDATE gescall_call_log 
                 SET call_status = $1, dtmf_pressed = $2, call_duration = $3, trunk_id = COALESCE(trunk_id, $4)
                 WHERE lead_id = $5 AND call_status IN ('DIALING', 'IVR_START', 'FAILED', '')
                 RETURNING log_id`,
                [status, dtmf || '0', duration, callState.trunkId, callState.leadId]
            );

            if (pgUpdateResult.rowCount === 0) {
                await pg.query(
                    `INSERT INTO gescall_call_log
                     (lead_id, phone_number, campaign_id, list_id, call_date, call_status, call_duration, dtmf_pressed, trunk_id)
                     VALUES ($1, $2, $3, $4, NOW(), $5, $6, $7, $8)`,
                    [callState.leadId, phone, callState.campaignId, callState.listId, status, duration, dtmf || '0', callState.trunkId]
                );
            }
        } else {
            // UPDATE-first: try to update existing DIALING/IVR_START record from aleatorio_callerid.agi
            const [updateResult] = await db.execute(
                `UPDATE gescall_call_log 
                 SET call_status = ?, dtmf_pressed = ?, call_duration = ?, updated_at = NOW(),
                     pool_callerid = COALESCE(NULLIF(pool_callerid, ''), ?)
                 WHERE lead_id = ? AND call_status IN ('DIALING', 'IVR_START', '')
                 ORDER BY call_date DESC LIMIT 1`,
                [status, dtmf || '0', duration, poolCid, callState.leadId]
            );

            if (updateResult.affectedRows === 0) {
                // No existing record — insert new one
                await db.execute(
                    `INSERT INTO gescall_call_log
                     (lead_id, phone_number, vendor_lead_code, pool_callerid, campaign_id, list_id, call_date, call_status, dtmf_pressed, call_duration)
                     VALUES (?, ?, ?, ?, ?, ?, NOW(), ?, ?, ?)`,
                    [callState.leadId, phone, vlc, poolCid, callState.campaignId, callState.listId, status, dtmf || '0', duration]
                );
            }
        }
    } catch (err) {
        console.error(`[ARI] Log to gescall error:`, err.message);
    }
}

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

// ─── PUBLIC API ──────────────────────────────────────────────────

function getActiveCalls() {
    const calls = [];
    activeCalls.forEach((state, channelId) => {
        calls.push({
            channelId,
            leadId: state.leadId,
            campaignId: state.campaignId,
            dtmf: state.dtmfBuffer,
            duration: Math.floor((Date.now() - state.startTime) / 1000),
        });
    });
    return calls;
}

function getClient() {
    return ari;
}

module.exports = { init, getActiveCalls, getClient };
