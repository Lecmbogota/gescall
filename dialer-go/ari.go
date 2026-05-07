package main

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io/ioutil"
	"net/http"
	"os"
	"time"
)

var httpClient = &http.Client{
	Timeout: 10 * time.Second,
	Transport: &http.Transport{
		MaxIdleConns:        100,
		MaxIdleConnsPerHost: 100,
		IdleConnTimeout:     90 * time.Second,
	},
}

type ARIClient struct {
	BaseURL  string
	Username string
	Password string
}

func NewARIClient() *ARIClient {
	url := os.Getenv("ARI_URL")
	if url == "" {
		// 8078: típico si transport-ws PJSIP usa 8088; ver http.conf bindport y back/.env ARI_URL
		url = "http://127.0.0.1:8078"
	}
	user := os.Getenv("ARI_USER")
	pass := os.Getenv("ARI_PASS")
	
	if user == "" {
		user = "gescall"
		pass = "gescall_ari_2026"
	}

	return &ARIClient{
		BaseURL:  url + "/ari",
		Username: user,
		Password: pass,
	}
}

type OriginateRequest struct {
	Endpoint     string `json:"endpoint"`
	Extension    string `json:"extension,omitempty"`
	Context      string `json:"context,omitempty"`
	Priority     int    `json:"priority,omitempty"`
	App          string `json:"app,omitempty"`
	AppArgs      string `json:"appArgs,omitempty"`
	CallerId     string `json:"callerId,omitempty"`
	Timeout      int    `json:"timeout"`
	Variables    map[string]string `json:"variables,omitempty"`
}

func (a *ARIClient) Originate(req OriginateRequest) (string, error) {
	url := fmt.Sprintf("%s/channels", a.BaseURL)
	payload, err := json.Marshal(req)
	if err != nil {
		return "", err
	}

	httpReq, err := http.NewRequest("POST", url, bytes.NewBuffer(payload))
	if err != nil {
		return "", err
	}

	httpReq.Header.Set("Content-Type", "application/json")
	httpReq.SetBasicAuth(a.Username, a.Password)

	resp, err := httpClient.Do(httpReq)
	if err != nil {
		return "", err
	}
	defer resp.Body.Close()

	if resp.StatusCode >= 300 {
		bodyBytes, _ := ioutil.ReadAll(resp.Body)
		return "", fmt.Errorf("ARI returned %d: %s", resp.StatusCode, string(bodyBytes))
	}

	var result struct {
		ID string `json:"id"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
		return "", err
	}
	
	return result.ID, nil
}

// Ping checks ARI connectivity by hitting the /asterisk/info endpoint
func (a *ARIClient) Ping() (int, error) {
	url := fmt.Sprintf("%s/asterisk/info", a.BaseURL)
	req, err := http.NewRequest("GET", url, nil)
	if err != nil {
		return 0, err
	}
	req.SetBasicAuth(a.Username, a.Password)

	resp, err := httpClient.Do(req)
	if err != nil {
		return 0, err
	}
	defer resp.Body.Close()

	return resp.StatusCode, nil
}
