/**
 * GesCall Metrics Service
 * Real-time tracking: CPS, ASR, ACD, active calls, calls per campaign
 */
const redis = require('../config/redisClient');
const pg = require('../config/pgDatabase');

class MetricsService {
    constructor() {
        // Rolling window counters
        this.callsOriginatedLast60s = [];    // timestamps of originated calls
        this.callsAnsweredLast60s = [];       // timestamps of answered calls
        this.callDurations = [];              // last 100 call durations
        this.failedOriginations = 0;          // 503/failed count in last 60s
        this.failedOriginationTimestamps = [];

        // SBC rate limiter
        this.sbcThrottled = false;
        this.sbcThrottleUntil = 0;
        this.consecutiveFailures = 0;
    }

    /**
     * Record a new call originated
     */
    recordOriginated() {
        const now = Date.now();
        this.callsOriginatedLast60s.push(now);
        this._pruneOlderThan(this.callsOriginatedLast60s, 60000);
    }

    /**
     * Record a call answered (connected)
     */
    recordAnswered() {
        const now = Date.now();
        this.callsAnsweredLast60s.push(now);
        this._pruneOlderThan(this.callsAnsweredLast60s, 60000);
    }

    /**
     * Record call duration when it ends
     */
    recordDuration(durationSecs) {
        this.callDurations.push(durationSecs);
        if (this.callDurations.length > 100) this.callDurations.shift();
    }

    /**
     * Record a failed origination (SBC 503, etc.)
     */
    recordFailedOriginate() {
        const now = Date.now();
        this.failedOriginationTimestamps.push(now);
        this._pruneOlderThan(this.failedOriginationTimestamps, 60000);
        this.consecutiveFailures++;

        // If 10+ consecutive failures in 30s, throttle for 5 seconds
        if (this.consecutiveFailures >= 10) {
            this.sbcThrottled = true;
            this.sbcThrottleUntil = now + 5000;
            console.warn(`[Metrics] ⚠️ SBC throttled: ${this.consecutiveFailures} consecutive failures — pausing 5s`);
            this.consecutiveFailures = 0;
        }
    }

    /**
     * Record a successful origination (resets failure counter)
     */
    recordSuccessfulOriginate() {
        this.consecutiveFailures = 0;
    }

    /**
     * Check if SBC is currently throttled
     */
    isSbcThrottled() {
        if (!this.sbcThrottled) return false;
        if (Date.now() > this.sbcThrottleUntil) {
            this.sbcThrottled = false;
            console.log('[Metrics] SBC throttle released');
            return false;
        }
        return true;
    }

    /**
     * Get current CPS (Calls Per Second) — rolling 10s window
     */
    getCurrentCPS() {
        const tenSecsAgo = Date.now() - 10000;
        const recent = this.callsOriginatedLast60s.filter(t => t > tenSecsAgo);
        return (recent.length / 10).toFixed(1);
    }

    /**
     * Get ASR (Answer-Seizure Ratio) — % of calls that got ANSWER
     */
    getASR() {
        const originated = this.callsOriginatedLast60s.length;
        if (originated === 0) return '0.0';
        const answered = this.callsAnsweredLast60s.length;
        return ((answered / originated) * 100).toFixed(1);
    }

    /**
     * Get ACD (Average Call Duration) in seconds
     */
    getACD() {
        if (this.callDurations.length === 0) return 0;
        const sum = this.callDurations.reduce((a, b) => a + b, 0);
        return Math.round(sum / this.callDurations.length);
    }

    /**
     * Get full snapshot of current metrics
     */
    async getSnapshot() {
        // Get active call count from Redis
        let activeCalls = 0;
        try {
            const keys = await redis.keys('gescall:call:*');
            activeCalls = keys ? keys.length : 0;
        } catch (e) { /* redis error */ }

        // Get per-campaign breakdown
        let campaignBreakdown = {};
        try {
            const keys = await redis.keys('gescall:call:*');
            if (keys) {
                for (const key of keys) {
                    const parts = key.split(':');
                    if (parts.length >= 3) {
                        const campId = parts[2];
                        campaignBreakdown[campId] = (campaignBreakdown[campId] || 0) + 1;
                    }
                }
            }
        } catch (e) { /* skip */ }

        // Get today's total calls from DB
        let todayTotal = 0;
        try {
            const result = await pg.query(`
                SELECT COUNT(*) as total FROM gescall_call_log 
                WHERE call_date >= CURRENT_DATE
            `);
            todayTotal = parseInt(result.rows[0]?.total) || 0;
        } catch (e) { /* db error */ }

        return {
            timestamp: new Date().toISOString(),
            activeCalls,
            cps: parseFloat(this.getCurrentCPS()),
            asr: parseFloat(this.getASR()),
            acd: this.getACD(),
            originatedLast60s: this.callsOriginatedLast60s.length,
            answeredLast60s: this.callsAnsweredLast60s.length,
            failedLast60s: this.failedOriginationTimestamps.length,
            sbcThrottled: this.sbcThrottled,
            todayTotal,
            campaignBreakdown
        };
    }

    _pruneOlderThan(arr, ms) {
        const cutoff = Date.now() - ms;
        while (arr.length > 0 && arr[0] < cutoff) arr.shift();
    }
}

module.exports = new MetricsService();
