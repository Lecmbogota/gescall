--
-- PostgreSQL database dump
--

\restrict RWM22UVCp6OjOzmqzIOLvnnqquB2wH2jpIbgBS38Pm1HSfHoVcouoGwdYLOq7dz

-- Dumped from database version 16.11
-- Dumped by pg_dump version 16.11

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: gescall_call_log; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.gescall_call_log (
    log_id bigint NOT NULL,
    lead_id bigint NOT NULL,
    campaign_id character varying(50) NOT NULL,
    list_id bigint NOT NULL,
    phone_number character varying(20) NOT NULL,
    call_date timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    call_status character varying(20) NOT NULL,
    call_duration integer DEFAULT 0,
    dtmf_pressed character varying(50) DEFAULT ''::character varying,
    transferred_to character varying(100) DEFAULT ''::character varying
);


ALTER TABLE public.gescall_call_log OWNER TO postgres;

--
-- Name: gescall_call_log_log_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.gescall_call_log_log_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.gescall_call_log_log_id_seq OWNER TO postgres;

--
-- Name: gescall_call_log_log_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.gescall_call_log_log_id_seq OWNED BY public.gescall_call_log.log_id;


--
-- Name: gescall_callerid_logs; Type: TABLE; Schema: public; Owner: gescall_admin
--

CREATE TABLE public.gescall_callerid_logs (
    id integer NOT NULL,
    pool_id integer,
    callerid character varying(20) NOT NULL,
    campaign_id character varying(50) NOT NULL,
    lead_phone character varying(20) NOT NULL,
    match_type character varying(20) NOT NULL,
    used_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);


ALTER TABLE public.gescall_callerid_logs OWNER TO gescall_admin;

--
-- Name: gescall_callerid_logs_id_seq; Type: SEQUENCE; Schema: public; Owner: gescall_admin
--

CREATE SEQUENCE public.gescall_callerid_logs_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.gescall_callerid_logs_id_seq OWNER TO gescall_admin;

--
-- Name: gescall_callerid_logs_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: gescall_admin
--

ALTER SEQUENCE public.gescall_callerid_logs_id_seq OWNED BY public.gescall_callerid_logs.id;


--
-- Name: gescall_callerid_pool_numbers; Type: TABLE; Schema: public; Owner: gescall_admin
--

CREATE TABLE public.gescall_callerid_pool_numbers (
    id integer NOT NULL,
    pool_id integer NOT NULL,
    callerid character varying(20) NOT NULL,
    is_active boolean DEFAULT true,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    area_code character(3) DEFAULT '000'::bpchar NOT NULL
);


ALTER TABLE public.gescall_callerid_pool_numbers OWNER TO gescall_admin;

--
-- Name: gescall_callerid_pool_numbers_id_seq; Type: SEQUENCE; Schema: public; Owner: gescall_admin
--

CREATE SEQUENCE public.gescall_callerid_pool_numbers_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.gescall_callerid_pool_numbers_id_seq OWNER TO gescall_admin;

--
-- Name: gescall_callerid_pool_numbers_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: gescall_admin
--

ALTER SEQUENCE public.gescall_callerid_pool_numbers_id_seq OWNED BY public.gescall_callerid_pool_numbers.id;


--
-- Name: gescall_callerid_pools; Type: TABLE; Schema: public; Owner: gescall_admin
--

CREATE TABLE public.gescall_callerid_pools (
    id integer NOT NULL,
    name character varying(100) NOT NULL,
    description text,
    country_code character varying(10) DEFAULT 'CO'::character varying,
    is_active boolean DEFAULT true,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);


ALTER TABLE public.gescall_callerid_pools OWNER TO gescall_admin;

--
-- Name: gescall_callerid_pools_id_seq; Type: SEQUENCE; Schema: public; Owner: gescall_admin
--

CREATE SEQUENCE public.gescall_callerid_pools_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.gescall_callerid_pools_id_seq OWNER TO gescall_admin;

--
-- Name: gescall_callerid_pools_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: gescall_admin
--

ALTER SEQUENCE public.gescall_callerid_pools_id_seq OWNED BY public.gescall_callerid_pools.id;


--
-- Name: gescall_callerid_usage_log; Type: TABLE; Schema: public; Owner: gescall_admin
--

CREATE TABLE public.gescall_callerid_usage_log (
    id bigint NOT NULL,
    campaign_id character varying(50),
    lead_id integer,
    phone_number character varying(20),
    callerid_used character varying(20),
    area_code_target character(3),
    pool_id integer,
    selection_result character varying(20),
    strategy character varying(20),
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);


ALTER TABLE public.gescall_callerid_usage_log OWNER TO gescall_admin;

--
-- Name: gescall_callerid_usage_log_id_seq; Type: SEQUENCE; Schema: public; Owner: gescall_admin
--

CREATE SEQUENCE public.gescall_callerid_usage_log_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.gescall_callerid_usage_log_id_seq OWNER TO gescall_admin;

--
-- Name: gescall_callerid_usage_log_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: gescall_admin
--

ALTER SEQUENCE public.gescall_callerid_usage_log_id_seq OWNED BY public.gescall_callerid_usage_log.id;


--
-- Name: gescall_campaign_callerid_settings; Type: TABLE; Schema: public; Owner: gescall_admin
--

CREATE TABLE public.gescall_campaign_callerid_settings (
    campaign_id character varying(50) NOT NULL,
    rotation_mode character varying(20) DEFAULT 'OFF'::character varying,
    pool_id integer,
    match_mode character varying(20) DEFAULT 'LEAD'::character varying,
    fixed_area_code character varying(10),
    fallback_callerid character varying(20),
    selection_strategy character varying(20) DEFAULT 'ROUND_ROBIN'::character varying,
    updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    match_area_code boolean DEFAULT true
);


ALTER TABLE public.gescall_campaign_callerid_settings OWNER TO gescall_admin;

--
-- Name: gescall_campaign_sessions; Type: TABLE; Schema: public; Owner: gescall_admin
--

CREATE TABLE public.gescall_campaign_sessions (
    session_id integer NOT NULL,
    campaign_id character varying(50) NOT NULL,
    activated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    activated_by character varying(50) NOT NULL,
    deactivated_at timestamp without time zone,
    deactivated_by character varying(50),
    duration_seconds integer
);


ALTER TABLE public.gescall_campaign_sessions OWNER TO gescall_admin;

--
-- Name: gescall_campaign_sessions_session_id_seq; Type: SEQUENCE; Schema: public; Owner: gescall_admin
--

CREATE SEQUENCE public.gescall_campaign_sessions_session_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.gescall_campaign_sessions_session_id_seq OWNER TO gescall_admin;

--
-- Name: gescall_campaign_sessions_session_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: gescall_admin
--

ALTER SEQUENCE public.gescall_campaign_sessions_session_id_seq OWNED BY public.gescall_campaign_sessions.session_id;


--
-- Name: gescall_campaigns; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.gescall_campaigns (
    campaign_id character varying(50) NOT NULL,
    campaign_name character varying(100) NOT NULL,
    active boolean DEFAULT true,
    dial_method character varying(20) DEFAULT 'RATIO'::character varying,
    auto_dial_level numeric(5,2) DEFAULT 1.0,
    dial_prefix character varying(10) DEFAULT ''::character varying,
    campaign_cid character varying(20) DEFAULT '0000000000'::character varying,
    xferconf_c_number character varying(50) DEFAULT ''::character varying,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    webhook_url text,
    max_retries integer DEFAULT 3,
    archived boolean DEFAULT false,
    lead_structure_schema jsonb DEFAULT '[{"name": "telefono", "required": true}, {"name": "speech", "required": false}]'::jsonb,
    tts_templates jsonb DEFAULT '[]'::jsonb,
    retry_settings jsonb DEFAULT '{}'::jsonb,
    alt_phone_enabled boolean DEFAULT false
);


ALTER TABLE public.gescall_campaigns OWNER TO postgres;

--
-- Name: gescall_campaigns_prefixes; Type: TABLE; Schema: public; Owner: gescall_admin
--

CREATE TABLE public.gescall_campaigns_prefixes (
    id integer NOT NULL,
    country_name character varying(100) NOT NULL,
    prefix character varying(10) NOT NULL,
    country_code character varying(5) NOT NULL,
    is_active boolean DEFAULT true,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);


ALTER TABLE public.gescall_campaigns_prefixes OWNER TO gescall_admin;

--
-- Name: gescall_campaigns_prefixes_id_seq; Type: SEQUENCE; Schema: public; Owner: gescall_admin
--

CREATE SEQUENCE public.gescall_campaigns_prefixes_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.gescall_campaigns_prefixes_id_seq OWNER TO gescall_admin;

--
-- Name: gescall_campaigns_prefixes_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: gescall_admin
--

ALTER SEQUENCE public.gescall_campaigns_prefixes_id_seq OWNED BY public.gescall_campaigns_prefixes.id;


--
-- Name: gescall_dnc; Type: TABLE; Schema: public; Owner: gescall_admin
--

CREATE TABLE public.gescall_dnc (
    id integer NOT NULL,
    phone_number character varying(20) NOT NULL,
    campaign_id character varying(50) DEFAULT NULL::character varying,
    added_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);


ALTER TABLE public.gescall_dnc OWNER TO gescall_admin;

--
-- Name: gescall_dnc_id_seq; Type: SEQUENCE; Schema: public; Owner: gescall_admin
--

CREATE SEQUENCE public.gescall_dnc_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.gescall_dnc_id_seq OWNER TO gescall_admin;

--
-- Name: gescall_dnc_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: gescall_admin
--

ALTER SEQUENCE public.gescall_dnc_id_seq OWNED BY public.gescall_dnc.id;


--
-- Name: gescall_dnc_rules; Type: TABLE; Schema: public; Owner: gescall_admin
--

CREATE TABLE public.gescall_dnc_rules (
    id integer NOT NULL,
    name character varying(100) NOT NULL,
    country_code character(2) NOT NULL,
    max_calls integer DEFAULT 3 NOT NULL,
    period_hours integer DEFAULT 720 NOT NULL,
    is_active boolean DEFAULT true,
    applies_to character varying(50) DEFAULT 'ALL'::character varying,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);


ALTER TABLE public.gescall_dnc_rules OWNER TO gescall_admin;

--
-- Name: gescall_dnc_rules_id_seq; Type: SEQUENCE; Schema: public; Owner: gescall_admin
--

CREATE SEQUENCE public.gescall_dnc_rules_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.gescall_dnc_rules_id_seq OWNER TO gescall_admin;

--
-- Name: gescall_dnc_rules_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: gescall_admin
--

ALTER SEQUENCE public.gescall_dnc_rules_id_seq OWNED BY public.gescall_dnc_rules.id;


--
-- Name: gescall_ivr_executions; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.gescall_ivr_executions (
    id integer NOT NULL,
    campaign_id character varying(50) NOT NULL,
    lead_id bigint,
    channel_id character varying(100),
    started_at timestamp without time zone,
    finished_at timestamp without time zone,
    duration_ms integer,
    status character varying(50),
    execution_data text
);


ALTER TABLE public.gescall_ivr_executions OWNER TO postgres;

--
-- Name: gescall_ivr_executions_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.gescall_ivr_executions_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.gescall_ivr_executions_id_seq OWNER TO postgres;

--
-- Name: gescall_ivr_executions_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.gescall_ivr_executions_id_seq OWNED BY public.gescall_ivr_executions.id;


--
-- Name: gescall_ivr_flows; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.gescall_ivr_flows (
    id integer NOT NULL,
    campaign_id character varying(50) NOT NULL,
    flow_json text NOT NULL,
    is_active boolean DEFAULT true,
    updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);


ALTER TABLE public.gescall_ivr_flows OWNER TO postgres;

--
-- Name: gescall_ivr_flows_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.gescall_ivr_flows_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.gescall_ivr_flows_id_seq OWNER TO postgres;

--
-- Name: gescall_ivr_flows_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.gescall_ivr_flows_id_seq OWNED BY public.gescall_ivr_flows.id;


--
-- Name: gescall_leads; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.gescall_leads (
    lead_id bigint NOT NULL,
    list_id bigint NOT NULL,
    status character varying(20) DEFAULT 'NEW'::character varying,
    phone_number character varying(20) NOT NULL,
    first_name character varying(50),
    last_name character varying(50),
    vendor_lead_code character varying(100),
    state character varying(50),
    alt_phone character varying(20),
    comments text,
    called_count integer DEFAULT 0,
    last_call_time timestamp without time zone,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    tts_vars jsonb DEFAULT '{}'::jsonb,
    phone_index smallint DEFAULT 0
);


ALTER TABLE public.gescall_leads OWNER TO postgres;

--
-- Name: gescall_leads_lead_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.gescall_leads_lead_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.gescall_leads_lead_id_seq OWNER TO postgres;

--
-- Name: gescall_leads_lead_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.gescall_leads_lead_id_seq OWNED BY public.gescall_leads.lead_id;


--
-- Name: gescall_lists; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.gescall_lists (
    list_id bigint NOT NULL,
    list_name character varying(100) NOT NULL,
    campaign_id character varying(50) NOT NULL,
    active boolean DEFAULT true,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    updated_by character varying(100),
    tts_template_id character varying(100)
);


ALTER TABLE public.gescall_lists OWNER TO postgres;

--
-- Name: gescall_role_permissions; Type: TABLE; Schema: public; Owner: gescall_admin
--

CREATE TABLE public.gescall_role_permissions (
    permission character varying(100) NOT NULL,
    role_id integer NOT NULL
);


ALTER TABLE public.gescall_role_permissions OWNER TO gescall_admin;

--
-- Name: gescall_roles; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.gescall_roles (
    role_name character varying(50) NOT NULL,
    description text,
    is_system boolean DEFAULT false,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    role_id integer NOT NULL
);


ALTER TABLE public.gescall_roles OWNER TO postgres;

--
-- Name: gescall_roles_role_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.gescall_roles_role_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.gescall_roles_role_id_seq OWNER TO postgres;

--
-- Name: gescall_roles_role_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.gescall_roles_role_id_seq OWNED BY public.gescall_roles.role_id;


--
-- Name: gescall_schedules; Type: TABLE; Schema: public; Owner: gescall_admin
--

CREATE TABLE public.gescall_schedules (
    id integer NOT NULL,
    schedule_type character varying(50) NOT NULL,
    target_id character varying(50) NOT NULL,
    target_name character varying(100),
    action character varying(20) NOT NULL,
    scheduled_at timestamp without time zone NOT NULL,
    end_at timestamp without time zone,
    recurring character varying(20) DEFAULT 'none'::character varying,
    created_by character varying(50),
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    executed boolean DEFAULT false
);


ALTER TABLE public.gescall_schedules OWNER TO gescall_admin;

--
-- Name: gescall_schedules_id_seq; Type: SEQUENCE; Schema: public; Owner: gescall_admin
--

CREATE SEQUENCE public.gescall_schedules_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.gescall_schedules_id_seq OWNER TO gescall_admin;

--
-- Name: gescall_schedules_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: gescall_admin
--

ALTER SEQUENCE public.gescall_schedules_id_seq OWNED BY public.gescall_schedules.id;


--
-- Name: gescall_settings; Type: TABLE; Schema: public; Owner: gescall_admin
--

CREATE TABLE public.gescall_settings (
    setting_key character varying(50) NOT NULL,
    setting_value text NOT NULL,
    updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);


ALTER TABLE public.gescall_settings OWNER TO gescall_admin;

--
-- Name: gescall_support_tickets; Type: TABLE; Schema: public; Owner: gescall_admin
--

CREATE TABLE public.gescall_support_tickets (
    id integer NOT NULL,
    jira_key character varying(20),
    jira_id character varying(50),
    title character varying(255) NOT NULL,
    description text,
    status character varying(50) DEFAULT 'Open'::character varying,
    priority character varying(20) DEFAULT 'Medium'::character varying,
    created_by character varying(50) NOT NULL,
    assigned_to character varying(100),
    created_at timestamp without time zone DEFAULT now(),
    updated_at timestamp without time zone DEFAULT now(),
    cliente character varying(255),
    url text,
    pais character varying(100),
    telefono character varying(50),
    usuario character varying(255)
);


ALTER TABLE public.gescall_support_tickets OWNER TO gescall_admin;

--
-- Name: gescall_support_tickets_id_seq; Type: SEQUENCE; Schema: public; Owner: gescall_admin
--

CREATE SEQUENCE public.gescall_support_tickets_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.gescall_support_tickets_id_seq OWNER TO gescall_admin;

--
-- Name: gescall_support_tickets_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: gescall_admin
--

ALTER SEQUENCE public.gescall_support_tickets_id_seq OWNED BY public.gescall_support_tickets.id;


--
-- Name: gescall_ticket_comments; Type: TABLE; Schema: public; Owner: gescall_admin
--

CREATE TABLE public.gescall_ticket_comments (
    id integer NOT NULL,
    ticket_id integer,
    jira_comment_id character varying(50),
    author character varying(100) NOT NULL,
    body text NOT NULL,
    source character varying(10) DEFAULT 'gescall'::character varying,
    created_at timestamp without time zone DEFAULT now()
);


ALTER TABLE public.gescall_ticket_comments OWNER TO gescall_admin;

--
-- Name: gescall_ticket_comments_id_seq; Type: SEQUENCE; Schema: public; Owner: gescall_admin
--

CREATE SEQUENCE public.gescall_ticket_comments_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.gescall_ticket_comments_id_seq OWNER TO gescall_admin;

--
-- Name: gescall_ticket_comments_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: gescall_admin
--

ALTER SEQUENCE public.gescall_ticket_comments_id_seq OWNED BY public.gescall_ticket_comments.id;


--
-- Name: gescall_trunks; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.gescall_trunks (
    trunk_id character varying(50) NOT NULL,
    trunk_name character varying(100) NOT NULL,
    provider_host character varying(100) NOT NULL,
    provider_port integer DEFAULT 5060,
    auth_user character varying(100),
    auth_password character varying(255),
    registration boolean DEFAULT true,
    max_channels integer DEFAULT 50,
    dial_prefix character varying(10),
    codecs character varying(100) DEFAULT 'ulaw,alaw'::character varying,
    active boolean DEFAULT true,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    max_cps integer DEFAULT 50
);


ALTER TABLE public.gescall_trunks OWNER TO postgres;

--
-- Name: gescall_tts_nodes; Type: TABLE; Schema: public; Owner: gescall_admin
--

CREATE TABLE public.gescall_tts_nodes (
    id integer NOT NULL,
    name character varying(100) NOT NULL,
    url character varying(255) NOT NULL,
    is_active boolean DEFAULT true,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);


ALTER TABLE public.gescall_tts_nodes OWNER TO gescall_admin;

--
-- Name: gescall_tts_nodes_id_seq; Type: SEQUENCE; Schema: public; Owner: gescall_admin
--

CREATE SEQUENCE public.gescall_tts_nodes_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.gescall_tts_nodes_id_seq OWNER TO gescall_admin;

--
-- Name: gescall_tts_nodes_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: gescall_admin
--

ALTER SEQUENCE public.gescall_tts_nodes_id_seq OWNED BY public.gescall_tts_nodes.id;


--
-- Name: gescall_upload_tasks; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.gescall_upload_tasks (
    id character varying(50) NOT NULL,
    task_type character varying(50) DEFAULT 'lead_upload'::character varying,
    list_id integer,
    campaign_id character varying(50),
    status character varying(20) DEFAULT 'pending'::character varying,
    total_records integer DEFAULT 0,
    processed_records integer DEFAULT 0,
    successful_records integer DEFAULT 0,
    error_records integer DEFAULT 0,
    error_log text,
    leads_data text,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    completed_at timestamp without time zone
);


ALTER TABLE public.gescall_upload_tasks OWNER TO postgres;

--
-- Name: gescall_user_campaigns; Type: TABLE; Schema: public; Owner: gescall_admin
--

CREATE TABLE public.gescall_user_campaigns (
    user_id integer NOT NULL,
    campaign_id character varying(50) NOT NULL,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);


ALTER TABLE public.gescall_user_campaigns OWNER TO gescall_admin;

--
-- Name: gescall_users; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.gescall_users (
    user_id integer NOT NULL,
    username character varying(50) NOT NULL,
    password_hash character varying(255) NOT NULL,
    active boolean DEFAULT true,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    api_token character varying(255),
    role_id integer NOT NULL
);


ALTER TABLE public.gescall_users OWNER TO postgres;

--
-- Name: gescall_users_user_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.gescall_users_user_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.gescall_users_user_id_seq OWNER TO postgres;

--
-- Name: gescall_users_user_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.gescall_users_user_id_seq OWNED BY public.gescall_users.user_id;


--
-- Name: gescall_whitelist_prefixes; Type: TABLE; Schema: public; Owner: gescall_admin
--

CREATE TABLE public.gescall_whitelist_prefixes (
    id integer NOT NULL,
    prefix character varying(10) NOT NULL,
    description character varying(255),
    is_active boolean DEFAULT true,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);


ALTER TABLE public.gescall_whitelist_prefixes OWNER TO gescall_admin;

--
-- Name: gescall_whitelist_prefixes_id_seq; Type: SEQUENCE; Schema: public; Owner: gescall_admin
--

CREATE SEQUENCE public.gescall_whitelist_prefixes_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.gescall_whitelist_prefixes_id_seq OWNER TO gescall_admin;

--
-- Name: gescall_whitelist_prefixes_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: gescall_admin
--

ALTER SEQUENCE public.gescall_whitelist_prefixes_id_seq OWNED BY public.gescall_whitelist_prefixes.id;


--
-- Name: gescall_call_log log_id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.gescall_call_log ALTER COLUMN log_id SET DEFAULT nextval('public.gescall_call_log_log_id_seq'::regclass);


--
-- Name: gescall_callerid_logs id; Type: DEFAULT; Schema: public; Owner: gescall_admin
--

ALTER TABLE ONLY public.gescall_callerid_logs ALTER COLUMN id SET DEFAULT nextval('public.gescall_callerid_logs_id_seq'::regclass);


--
-- Name: gescall_callerid_pool_numbers id; Type: DEFAULT; Schema: public; Owner: gescall_admin
--

ALTER TABLE ONLY public.gescall_callerid_pool_numbers ALTER COLUMN id SET DEFAULT nextval('public.gescall_callerid_pool_numbers_id_seq'::regclass);


--
-- Name: gescall_callerid_pools id; Type: DEFAULT; Schema: public; Owner: gescall_admin
--

ALTER TABLE ONLY public.gescall_callerid_pools ALTER COLUMN id SET DEFAULT nextval('public.gescall_callerid_pools_id_seq'::regclass);


--
-- Name: gescall_callerid_usage_log id; Type: DEFAULT; Schema: public; Owner: gescall_admin
--

ALTER TABLE ONLY public.gescall_callerid_usage_log ALTER COLUMN id SET DEFAULT nextval('public.gescall_callerid_usage_log_id_seq'::regclass);


--
-- Name: gescall_campaign_sessions session_id; Type: DEFAULT; Schema: public; Owner: gescall_admin
--

ALTER TABLE ONLY public.gescall_campaign_sessions ALTER COLUMN session_id SET DEFAULT nextval('public.gescall_campaign_sessions_session_id_seq'::regclass);


--
-- Name: gescall_campaigns_prefixes id; Type: DEFAULT; Schema: public; Owner: gescall_admin
--

ALTER TABLE ONLY public.gescall_campaigns_prefixes ALTER COLUMN id SET DEFAULT nextval('public.gescall_campaigns_prefixes_id_seq'::regclass);


--
-- Name: gescall_dnc id; Type: DEFAULT; Schema: public; Owner: gescall_admin
--

ALTER TABLE ONLY public.gescall_dnc ALTER COLUMN id SET DEFAULT nextval('public.gescall_dnc_id_seq'::regclass);


--
-- Name: gescall_dnc_rules id; Type: DEFAULT; Schema: public; Owner: gescall_admin
--

ALTER TABLE ONLY public.gescall_dnc_rules ALTER COLUMN id SET DEFAULT nextval('public.gescall_dnc_rules_id_seq'::regclass);


--
-- Name: gescall_ivr_executions id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.gescall_ivr_executions ALTER COLUMN id SET DEFAULT nextval('public.gescall_ivr_executions_id_seq'::regclass);


--
-- Name: gescall_ivr_flows id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.gescall_ivr_flows ALTER COLUMN id SET DEFAULT nextval('public.gescall_ivr_flows_id_seq'::regclass);


--
-- Name: gescall_leads lead_id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.gescall_leads ALTER COLUMN lead_id SET DEFAULT nextval('public.gescall_leads_lead_id_seq'::regclass);


--
-- Name: gescall_roles role_id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.gescall_roles ALTER COLUMN role_id SET DEFAULT nextval('public.gescall_roles_role_id_seq'::regclass);


--
-- Name: gescall_schedules id; Type: DEFAULT; Schema: public; Owner: gescall_admin
--

ALTER TABLE ONLY public.gescall_schedules ALTER COLUMN id SET DEFAULT nextval('public.gescall_schedules_id_seq'::regclass);


--
-- Name: gescall_support_tickets id; Type: DEFAULT; Schema: public; Owner: gescall_admin
--

ALTER TABLE ONLY public.gescall_support_tickets ALTER COLUMN id SET DEFAULT nextval('public.gescall_support_tickets_id_seq'::regclass);


--
-- Name: gescall_ticket_comments id; Type: DEFAULT; Schema: public; Owner: gescall_admin
--

ALTER TABLE ONLY public.gescall_ticket_comments ALTER COLUMN id SET DEFAULT nextval('public.gescall_ticket_comments_id_seq'::regclass);


--
-- Name: gescall_tts_nodes id; Type: DEFAULT; Schema: public; Owner: gescall_admin
--

ALTER TABLE ONLY public.gescall_tts_nodes ALTER COLUMN id SET DEFAULT nextval('public.gescall_tts_nodes_id_seq'::regclass);


--
-- Name: gescall_users user_id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.gescall_users ALTER COLUMN user_id SET DEFAULT nextval('public.gescall_users_user_id_seq'::regclass);


--
-- Name: gescall_whitelist_prefixes id; Type: DEFAULT; Schema: public; Owner: gescall_admin
--

ALTER TABLE ONLY public.gescall_whitelist_prefixes ALTER COLUMN id SET DEFAULT nextval('public.gescall_whitelist_prefixes_id_seq'::regclass);


--
-- Name: gescall_call_log gescall_call_log_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.gescall_call_log
    ADD CONSTRAINT gescall_call_log_pkey PRIMARY KEY (log_id);


--
-- Name: gescall_callerid_logs gescall_callerid_logs_pkey; Type: CONSTRAINT; Schema: public; Owner: gescall_admin
--

ALTER TABLE ONLY public.gescall_callerid_logs
    ADD CONSTRAINT gescall_callerid_logs_pkey PRIMARY KEY (id);


--
-- Name: gescall_callerid_pool_numbers gescall_callerid_pool_numbers_pkey; Type: CONSTRAINT; Schema: public; Owner: gescall_admin
--

ALTER TABLE ONLY public.gescall_callerid_pool_numbers
    ADD CONSTRAINT gescall_callerid_pool_numbers_pkey PRIMARY KEY (id);


--
-- Name: gescall_callerid_pool_numbers gescall_callerid_pool_numbers_pool_id_callerid_key; Type: CONSTRAINT; Schema: public; Owner: gescall_admin
--

ALTER TABLE ONLY public.gescall_callerid_pool_numbers
    ADD CONSTRAINT gescall_callerid_pool_numbers_pool_id_callerid_key UNIQUE (pool_id, callerid);


--
-- Name: gescall_callerid_pools gescall_callerid_pools_name_key; Type: CONSTRAINT; Schema: public; Owner: gescall_admin
--

ALTER TABLE ONLY public.gescall_callerid_pools
    ADD CONSTRAINT gescall_callerid_pools_name_key UNIQUE (name);


--
-- Name: gescall_callerid_pools gescall_callerid_pools_pkey; Type: CONSTRAINT; Schema: public; Owner: gescall_admin
--

ALTER TABLE ONLY public.gescall_callerid_pools
    ADD CONSTRAINT gescall_callerid_pools_pkey PRIMARY KEY (id);


--
-- Name: gescall_callerid_usage_log gescall_callerid_usage_log_pkey; Type: CONSTRAINT; Schema: public; Owner: gescall_admin
--

ALTER TABLE ONLY public.gescall_callerid_usage_log
    ADD CONSTRAINT gescall_callerid_usage_log_pkey PRIMARY KEY (id);


--
-- Name: gescall_campaign_callerid_settings gescall_campaign_callerid_settings_pkey; Type: CONSTRAINT; Schema: public; Owner: gescall_admin
--

ALTER TABLE ONLY public.gescall_campaign_callerid_settings
    ADD CONSTRAINT gescall_campaign_callerid_settings_pkey PRIMARY KEY (campaign_id);


--
-- Name: gescall_campaign_sessions gescall_campaign_sessions_pkey; Type: CONSTRAINT; Schema: public; Owner: gescall_admin
--

ALTER TABLE ONLY public.gescall_campaign_sessions
    ADD CONSTRAINT gescall_campaign_sessions_pkey PRIMARY KEY (session_id);


--
-- Name: gescall_campaigns gescall_campaigns_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.gescall_campaigns
    ADD CONSTRAINT gescall_campaigns_pkey PRIMARY KEY (campaign_id);


--
-- Name: gescall_campaigns_prefixes gescall_campaigns_prefixes_pkey; Type: CONSTRAINT; Schema: public; Owner: gescall_admin
--

ALTER TABLE ONLY public.gescall_campaigns_prefixes
    ADD CONSTRAINT gescall_campaigns_prefixes_pkey PRIMARY KEY (id);


--
-- Name: gescall_campaigns_prefixes gescall_campaigns_prefixes_prefix_key; Type: CONSTRAINT; Schema: public; Owner: gescall_admin
--

ALTER TABLE ONLY public.gescall_campaigns_prefixes
    ADD CONSTRAINT gescall_campaigns_prefixes_prefix_key UNIQUE (prefix);


--
-- Name: gescall_dnc gescall_dnc_phone_number_campaign_id_key; Type: CONSTRAINT; Schema: public; Owner: gescall_admin
--

ALTER TABLE ONLY public.gescall_dnc
    ADD CONSTRAINT gescall_dnc_phone_number_campaign_id_key UNIQUE (phone_number, campaign_id);


--
-- Name: gescall_dnc gescall_dnc_pkey; Type: CONSTRAINT; Schema: public; Owner: gescall_admin
--

ALTER TABLE ONLY public.gescall_dnc
    ADD CONSTRAINT gescall_dnc_pkey PRIMARY KEY (id);


--
-- Name: gescall_dnc_rules gescall_dnc_rules_pkey; Type: CONSTRAINT; Schema: public; Owner: gescall_admin
--

ALTER TABLE ONLY public.gescall_dnc_rules
    ADD CONSTRAINT gescall_dnc_rules_pkey PRIMARY KEY (id);


--
-- Name: gescall_ivr_executions gescall_ivr_executions_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.gescall_ivr_executions
    ADD CONSTRAINT gescall_ivr_executions_pkey PRIMARY KEY (id);


--
-- Name: gescall_ivr_flows gescall_ivr_flows_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.gescall_ivr_flows
    ADD CONSTRAINT gescall_ivr_flows_pkey PRIMARY KEY (id);


--
-- Name: gescall_leads gescall_leads_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.gescall_leads
    ADD CONSTRAINT gescall_leads_pkey PRIMARY KEY (lead_id);


--
-- Name: gescall_lists gescall_lists_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.gescall_lists
    ADD CONSTRAINT gescall_lists_pkey PRIMARY KEY (list_id);


--
-- Name: gescall_role_permissions gescall_role_permissions_pkey; Type: CONSTRAINT; Schema: public; Owner: gescall_admin
--

ALTER TABLE ONLY public.gescall_role_permissions
    ADD CONSTRAINT gescall_role_permissions_pkey PRIMARY KEY (role_id, permission);


--
-- Name: gescall_roles gescall_roles_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.gescall_roles
    ADD CONSTRAINT gescall_roles_pkey PRIMARY KEY (role_id);


--
-- Name: gescall_roles gescall_roles_role_name_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.gescall_roles
    ADD CONSTRAINT gescall_roles_role_name_key UNIQUE (role_name);


--
-- Name: gescall_schedules gescall_schedules_pkey; Type: CONSTRAINT; Schema: public; Owner: gescall_admin
--

ALTER TABLE ONLY public.gescall_schedules
    ADD CONSTRAINT gescall_schedules_pkey PRIMARY KEY (id);


--
-- Name: gescall_settings gescall_settings_pkey; Type: CONSTRAINT; Schema: public; Owner: gescall_admin
--

ALTER TABLE ONLY public.gescall_settings
    ADD CONSTRAINT gescall_settings_pkey PRIMARY KEY (setting_key);


--
-- Name: gescall_support_tickets gescall_support_tickets_pkey; Type: CONSTRAINT; Schema: public; Owner: gescall_admin
--

ALTER TABLE ONLY public.gescall_support_tickets
    ADD CONSTRAINT gescall_support_tickets_pkey PRIMARY KEY (id);


--
-- Name: gescall_ticket_comments gescall_ticket_comments_pkey; Type: CONSTRAINT; Schema: public; Owner: gescall_admin
--

ALTER TABLE ONLY public.gescall_ticket_comments
    ADD CONSTRAINT gescall_ticket_comments_pkey PRIMARY KEY (id);


--
-- Name: gescall_trunks gescall_trunks_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.gescall_trunks
    ADD CONSTRAINT gescall_trunks_pkey PRIMARY KEY (trunk_id);


--
-- Name: gescall_tts_nodes gescall_tts_nodes_pkey; Type: CONSTRAINT; Schema: public; Owner: gescall_admin
--

ALTER TABLE ONLY public.gescall_tts_nodes
    ADD CONSTRAINT gescall_tts_nodes_pkey PRIMARY KEY (id);


--
-- Name: gescall_upload_tasks gescall_upload_tasks_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.gescall_upload_tasks
    ADD CONSTRAINT gescall_upload_tasks_pkey PRIMARY KEY (id);


--
-- Name: gescall_user_campaigns gescall_user_campaigns_pkey; Type: CONSTRAINT; Schema: public; Owner: gescall_admin
--

ALTER TABLE ONLY public.gescall_user_campaigns
    ADD CONSTRAINT gescall_user_campaigns_pkey PRIMARY KEY (user_id, campaign_id);


--
-- Name: gescall_users gescall_users_api_token_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.gescall_users
    ADD CONSTRAINT gescall_users_api_token_key UNIQUE (api_token);


--
-- Name: gescall_users gescall_users_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.gescall_users
    ADD CONSTRAINT gescall_users_pkey PRIMARY KEY (user_id);


--
-- Name: gescall_users gescall_users_username_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.gescall_users
    ADD CONSTRAINT gescall_users_username_key UNIQUE (username);


--
-- Name: gescall_whitelist_prefixes gescall_whitelist_prefixes_pkey; Type: CONSTRAINT; Schema: public; Owner: gescall_admin
--

ALTER TABLE ONLY public.gescall_whitelist_prefixes
    ADD CONSTRAINT gescall_whitelist_prefixes_pkey PRIMARY KEY (id);


--
-- Name: gescall_whitelist_prefixes gescall_whitelist_prefixes_prefix_key; Type: CONSTRAINT; Schema: public; Owner: gescall_admin
--

ALTER TABLE ONLY public.gescall_whitelist_prefixes
    ADD CONSTRAINT gescall_whitelist_prefixes_prefix_key UNIQUE (prefix);


--
-- Name: idx_call_log_phone_date; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_call_log_phone_date ON public.gescall_call_log USING btree (phone_number, call_date);


--
-- Name: idx_campaign_sessions_camp; Type: INDEX; Schema: public; Owner: gescall_admin
--

CREATE INDEX idx_campaign_sessions_camp ON public.gescall_campaign_sessions USING btree (campaign_id);


--
-- Name: idx_cid_log_callerid; Type: INDEX; Schema: public; Owner: gescall_admin
--

CREATE INDEX idx_cid_log_callerid ON public.gescall_callerid_usage_log USING btree (callerid_used);


--
-- Name: idx_cid_log_campaign_date; Type: INDEX; Schema: public; Owner: gescall_admin
--

CREATE INDEX idx_cid_log_campaign_date ON public.gescall_callerid_usage_log USING btree (campaign_id, created_at);


--
-- Name: idx_dnc_campaign; Type: INDEX; Schema: public; Owner: gescall_admin
--

CREATE INDEX idx_dnc_campaign ON public.gescall_dnc USING btree (campaign_id);


--
-- Name: idx_dnc_phone; Type: INDEX; Schema: public; Owner: gescall_admin
--

CREATE INDEX idx_dnc_phone ON public.gescall_dnc USING btree (phone_number);


--
-- Name: idx_gescall_call_log_camp_date; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_gescall_call_log_camp_date ON public.gescall_call_log USING btree (campaign_id, call_date DESC);


--
-- Name: idx_gescall_call_log_lead_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_gescall_call_log_lead_id ON public.gescall_call_log USING btree (lead_id);


--
-- Name: idx_gescall_call_log_list_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_gescall_call_log_list_id ON public.gescall_call_log USING btree (list_id);


--
-- Name: idx_gescall_ivr_flows_campaign_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE UNIQUE INDEX idx_gescall_ivr_flows_campaign_id ON public.gescall_ivr_flows USING btree (campaign_id);


--
-- Name: idx_gescall_leads_list_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_gescall_leads_list_id ON public.gescall_leads USING btree (list_id);


--
-- Name: idx_leads_status_list; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_leads_status_list ON public.gescall_leads USING btree (status, list_id);


--
-- Name: idx_ticket_comments_ticket_id; Type: INDEX; Schema: public; Owner: gescall_admin
--

CREATE INDEX idx_ticket_comments_ticket_id ON public.gescall_ticket_comments USING btree (ticket_id);


--
-- Name: idx_tickets_created_by; Type: INDEX; Schema: public; Owner: gescall_admin
--

CREATE INDEX idx_tickets_created_by ON public.gescall_support_tickets USING btree (created_by);


--
-- Name: idx_tickets_jira_key; Type: INDEX; Schema: public; Owner: gescall_admin
--

CREATE INDEX idx_tickets_jira_key ON public.gescall_support_tickets USING btree (jira_key);


--
-- Name: idx_tickets_status; Type: INDEX; Schema: public; Owner: gescall_admin
--

CREATE INDEX idx_tickets_status ON public.gescall_support_tickets USING btree (status);


--
-- Name: gescall_role_permissions fk_permissions_role_id; Type: FK CONSTRAINT; Schema: public; Owner: gescall_admin
--

ALTER TABLE ONLY public.gescall_role_permissions
    ADD CONSTRAINT fk_permissions_role_id FOREIGN KEY (role_id) REFERENCES public.gescall_roles(role_id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: gescall_users fk_users_role_id; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.gescall_users
    ADD CONSTRAINT fk_users_role_id FOREIGN KEY (role_id) REFERENCES public.gescall_roles(role_id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: gescall_callerid_logs gescall_callerid_logs_pool_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: gescall_admin
--

ALTER TABLE ONLY public.gescall_callerid_logs
    ADD CONSTRAINT gescall_callerid_logs_pool_id_fkey FOREIGN KEY (pool_id) REFERENCES public.gescall_callerid_pools(id) ON DELETE SET NULL;


--
-- Name: gescall_callerid_pool_numbers gescall_callerid_pool_numbers_pool_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: gescall_admin
--

ALTER TABLE ONLY public.gescall_callerid_pool_numbers
    ADD CONSTRAINT gescall_callerid_pool_numbers_pool_id_fkey FOREIGN KEY (pool_id) REFERENCES public.gescall_callerid_pools(id) ON DELETE CASCADE;


--
-- Name: gescall_campaign_callerid_settings gescall_campaign_callerid_settings_campaign_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: gescall_admin
--

ALTER TABLE ONLY public.gescall_campaign_callerid_settings
    ADD CONSTRAINT gescall_campaign_callerid_settings_campaign_id_fkey FOREIGN KEY (campaign_id) REFERENCES public.gescall_campaigns(campaign_id) ON DELETE CASCADE;


--
-- Name: gescall_campaign_callerid_settings gescall_campaign_callerid_settings_pool_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: gescall_admin
--

ALTER TABLE ONLY public.gescall_campaign_callerid_settings
    ADD CONSTRAINT gescall_campaign_callerid_settings_pool_id_fkey FOREIGN KEY (pool_id) REFERENCES public.gescall_callerid_pools(id) ON DELETE SET NULL;


--
-- Name: gescall_campaign_sessions gescall_campaign_sessions_campaign_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: gescall_admin
--

ALTER TABLE ONLY public.gescall_campaign_sessions
    ADD CONSTRAINT gescall_campaign_sessions_campaign_id_fkey FOREIGN KEY (campaign_id) REFERENCES public.gescall_campaigns(campaign_id);


--
-- Name: gescall_ivr_flows gescall_ivr_flows_campaign_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.gescall_ivr_flows
    ADD CONSTRAINT gescall_ivr_flows_campaign_id_fkey FOREIGN KEY (campaign_id) REFERENCES public.gescall_campaigns(campaign_id) ON DELETE CASCADE;


--
-- Name: gescall_leads gescall_leads_list_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.gescall_leads
    ADD CONSTRAINT gescall_leads_list_id_fkey FOREIGN KEY (list_id) REFERENCES public.gescall_lists(list_id) ON DELETE CASCADE;


--
-- Name: gescall_lists gescall_lists_campaign_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.gescall_lists
    ADD CONSTRAINT gescall_lists_campaign_id_fkey FOREIGN KEY (campaign_id) REFERENCES public.gescall_campaigns(campaign_id) ON DELETE CASCADE;


--
-- Name: gescall_ticket_comments gescall_ticket_comments_ticket_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: gescall_admin
--

ALTER TABLE ONLY public.gescall_ticket_comments
    ADD CONSTRAINT gescall_ticket_comments_ticket_id_fkey FOREIGN KEY (ticket_id) REFERENCES public.gescall_support_tickets(id) ON DELETE CASCADE;


--
-- Name: gescall_user_campaigns gescall_user_campaigns_campaign_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: gescall_admin
--

ALTER TABLE ONLY public.gescall_user_campaigns
    ADD CONSTRAINT gescall_user_campaigns_campaign_id_fkey FOREIGN KEY (campaign_id) REFERENCES public.gescall_campaigns(campaign_id) ON DELETE CASCADE;


--
-- Name: gescall_user_campaigns gescall_user_campaigns_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: gescall_admin
--

ALTER TABLE ONLY public.gescall_user_campaigns
    ADD CONSTRAINT gescall_user_campaigns_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.gescall_users(user_id) ON DELETE CASCADE;


--
-- Name: TABLE gescall_call_log; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.gescall_call_log TO gescall_admin;


--
-- Name: SEQUENCE gescall_call_log_log_id_seq; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON SEQUENCE public.gescall_call_log_log_id_seq TO gescall_admin;


--
-- Name: TABLE gescall_campaigns; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.gescall_campaigns TO gescall_admin;


--
-- Name: TABLE gescall_ivr_executions; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.gescall_ivr_executions TO gescall_admin;


--
-- Name: SEQUENCE gescall_ivr_executions_id_seq; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON SEQUENCE public.gescall_ivr_executions_id_seq TO gescall_admin;


--
-- Name: TABLE gescall_ivr_flows; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.gescall_ivr_flows TO gescall_admin;


--
-- Name: SEQUENCE gescall_ivr_flows_id_seq; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON SEQUENCE public.gescall_ivr_flows_id_seq TO gescall_admin;


--
-- Name: TABLE gescall_leads; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.gescall_leads TO gescall_admin;


--
-- Name: SEQUENCE gescall_leads_lead_id_seq; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON SEQUENCE public.gescall_leads_lead_id_seq TO gescall_admin;


--
-- Name: TABLE gescall_lists; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.gescall_lists TO gescall_admin;


--
-- Name: TABLE gescall_roles; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.gescall_roles TO gescall_admin;


--
-- Name: TABLE gescall_trunks; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.gescall_trunks TO gescall_admin;


--
-- Name: TABLE gescall_upload_tasks; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.gescall_upload_tasks TO gescall_admin;


--
-- Name: TABLE gescall_users; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.gescall_users TO gescall_admin;


--
-- Name: SEQUENCE gescall_users_user_id_seq; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON SEQUENCE public.gescall_users_user_id_seq TO gescall_admin;


--
-- PostgreSQL database dump complete
--

\unrestrict RWM22UVCp6OjOzmqzIOLvnnqquB2wH2jpIbgBS38Pm1HSfHoVcouoGwdYLOq7dz

