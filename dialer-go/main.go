package main

import (
	"context"
	"database/sql"
	"fmt"
	"log"
	"os"
	"os/signal"
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

	// Clear stale call keys in Redis
	keys, err := Redis.Keys(ctx, "gescall:call:*").Result()
	if err == nil && len(keys) > 0 {
		log.Printf("Clearing %d stuck call keys from previous run...", len(keys))
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
