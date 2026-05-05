package main

import (
	"context"
	"database/sql"
	"fmt"
	"log"
	"os"
	"os/signal"
	"strings"
	"syscall"

	"github.com/joho/godotenv"
	_ "github.com/lib/pq"
	"github.com/redis/go-redis/v9"
)

var (
	DB    *sql.DB
	Redis *redis.Client
	ctx   = context.Background()
)

func init() {
	// Load .env with absolute path for PM2 compatibility
	_ = godotenv.Load("/opt/gescall/back/.env")
}

func main() {
	log.Println("Starting GesCall Dialer Go...")

	// Connect PostgreSQL
	dbUser := os.Getenv("PG_USER")
	dbPass := os.Getenv("PG_PASSWORD")
	dbHost := os.Getenv("PG_HOST")
	dbPort := os.Getenv("PG_PORT")
	dbName := os.Getenv("PG_DATABASE")
	if dbUser == "" {
		dbUser = "gescall_admin"
		dbPass = "TEcnologia2020"
		dbHost = "localhost"
		dbPort = "5432"
		dbName = "gescall_db"
	}
	connStr := fmt.Sprintf("host=%s port=%s user=%s password=%s dbname=%s sslmode=disable", dbHost, dbPort, dbUser, dbPass, dbName)
	var err error
	DB, err = sql.Open("postgres", connStr)
	if err != nil {
		log.Fatalf("Failed to connect to Postgres: %v", err)
	}
	defer DB.Close()
	if err := DB.Ping(); err != nil {
		log.Fatalf("Failed to ping Postgres: %v", err)
	}
	log.Println("Connected to PostgreSQL")

	// Connect Redis — prefer REDIS_URL (same as Node redisClient) so hopper matches backend
	if redisURL := os.Getenv("REDIS_URL"); redisURL != "" {
		opt, err := redis.ParseURL(redisURL)
		if err != nil {
			log.Fatalf("Invalid REDIS_URL: %v", err)
		}
		Redis = redis.NewClient(opt)
	} else {
		redisHost := os.Getenv("REDIS_HOST")
		if redisHost == "" {
			redisHost = "localhost"
		}
		redisPort := os.Getenv("REDIS_PORT")
		if redisPort == "" {
			redisPort = "6379"
		}
		Redis = redis.NewClient(&redis.Options{
			Addr:     fmt.Sprintf("%s:%s", redisHost, redisPort),
			Password: "",
			DB:       0,
		})
	}
	if err := Redis.Ping(ctx).Err(); err != nil {
		log.Fatalf("Failed to connect to Redis: %v", err)
	}
	log.Println("Connected to Redis")

	// Si no hay SBC_* en .env, tomar el primer troncal activo de PostgreSQL (evita PJSIP/sbc233 y HOST vacío).
	enrichSBCDefaultsFromDB(DB)

	// Borrar claves gescall:call:* al arrancar (evita capacidad bloqueada por reinicios a mitad de marcación).
	keys, err := Redis.Keys(ctx, "gescall:call:*").Result()
	if err == nil && len(keys) > 0 {
		log.Printf("Clearing %d gescall:call:* keys from Redis (dialer restart)...", len(keys))
		Redis.Del(ctx, keys...)
	}

	// Initialize Engine
	engine := NewDialerEngine()
	engine.Start()

	// Wait for termination signal
	sigChan := make(chan os.Signal, 1)
	signal.Notify(sigChan, os.Interrupt, syscall.SIGTERM)
	<-sigChan

	log.Println("Shutting down dialer...")
	engine.Stop()
}

// enrichSBCDefaultsFromDB rellena SBC_* faltantes desde el primer troncal activo en PostgreSQL
// (campañas sin trunk_id; evita endpoint fantasma "sbc233" y HOST vacío → ARI "Allocation failed").
func enrichSBCDefaultsFromDB(db *sql.DB) {
	needHost := strings.TrimSpace(os.Getenv("SBC_HOST")) == ""
	ep := strings.TrimSpace(os.Getenv("SBC_ENDPOINT"))
	needEp := ep == "" || ep == "sbc233"
	if !needHost && !needEp {
		return
	}
	var tid, host string
	var port sql.NullInt64
	err := db.QueryRow(`
		SELECT trunk_id::text, COALESCE(NULLIF(TRIM(provider_host), ''), ''),
		       provider_port
		FROM gescall_trunks
		WHERE active = true
		ORDER BY trunk_id
		LIMIT 1
	`).Scan(&tid, &host, &port)
	if err != nil {
		log.Printf("[Dialer] Falta SBC_* y no hay troncal activo en BD: %v", err)
		return
	}
	if host == "" {
		log.Printf("[Dialer] Troncal %s sin provider_host; defina SBC_HOST en back/.env", tid)
		return
	}
	if needEp {
		_ = os.Setenv("SBC_ENDPOINT", tid)
	}
	if needHost {
		_ = os.Setenv("SBC_HOST", host)
	}
	if strings.TrimSpace(os.Getenv("SBC_PORT")) == "" {
		p := "5060"
		if port.Valid && port.Int64 > 0 {
			p = fmt.Sprintf("%d", port.Int64)
		}
		_ = os.Setenv("SBC_PORT", p)
	}
	log.Printf("[Dialer] SBC auto desde BD: ENDPOINT=%s HOST=%s PORT=%s",
		os.Getenv("SBC_ENDPOINT"), os.Getenv("SBC_HOST"), os.Getenv("SBC_PORT"))
}
