--
-- PostgreSQL database dump
--

\restrict BwaWL4qRFYRpUGZWhxcBiH75daHMtNwReHt2YBaMh08W7y2CvKOT2reuJ69f73u

-- Dumped from database version 17.9 (Debian 17.9-1.pgdg13+1)
-- Dumped by pg_dump version 17.9 (Debian 17.9-1.pgdg13+1)

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET transaction_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Name: gescall_build_dial_schedule_json(boolean, text, jsonb); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.gescall_build_dial_schedule_json(p_enabled boolean, p_timezone text, p_windows jsonb) RETURNS jsonb
    LANGUAGE plpgsql IMMUTABLE
    AS $$
            BEGIN
                RETURN jsonb_build_object(
                    'enabled', COALESCE(p_enabled, FALSE),
                    'timezone', COALESCE(NULLIF(TRIM(p_timezone), ''), 'America/Mexico_City'),
                    'windows', COALESCE(p_windows, '[]'::jsonb)
                );
            END;
            $$;


--
-- Name: gescall_propagate_schedule_template_changes(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.gescall_propagate_schedule_template_changes() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
            BEGIN
                UPDATE gescall_campaigns
                   SET dial_schedule = gescall_build_dial_schedule_json(
                            NEW.enabled, NEW.timezone, NEW.windows
                       )
                 WHERE schedule_template_id = NEW.id;

                NEW.updated_at := NOW();
                RETURN NEW;
            END;
            $$;


--
-- Name: gescall_route_rules_audit_fn(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.gescall_route_rules_audit_fn() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
            DECLARE
                actor TEXT := NULLIF(current_setting('gescall.current_user', true), '');
            BEGIN
                IF TG_OP = 'INSERT' THEN
                    INSERT INTO gescall_route_rules_audit (rule_id, action, changed_by, new_data)
                    VALUES (NEW.id, 'INSERT', COALESCE(actor, NEW.created_by), to_jsonb(NEW));
                    RETURN NEW;
                ELSIF TG_OP = 'UPDATE' THEN
                    INSERT INTO gescall_route_rules_audit (rule_id, action, changed_by, old_data, new_data)
                    VALUES (NEW.id, 'UPDATE', COALESCE(actor, NEW.updated_by), to_jsonb(OLD), to_jsonb(NEW));
                    RETURN NEW;
                ELSIF TG_OP = 'DELETE' THEN
                    INSERT INTO gescall_route_rules_audit (rule_id, action, changed_by, old_data)
                    VALUES (OLD.id, 'DELETE', actor, to_jsonb(OLD));
                    RETURN OLD;
                END IF;
                RETURN NULL;
            END;
            $$;


SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: gescall_agent_callbacks; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.gescall_agent_callbacks (
    id integer NOT NULL,
    assignee_user_id integer NOT NULL,
    campaign_id character varying(64),
    contact_name character varying(200) NOT NULL,
    phone character varying(40),
    scheduled_at timestamp with time zone NOT NULL,
    notes text,
    status character varying(20) DEFAULT 'PENDING'::character varying NOT NULL,
    created_by_user_id integer,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);


--
-- Name: gescall_agent_callbacks_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.gescall_agent_callbacks_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: gescall_agent_callbacks_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.gescall_agent_callbacks_id_seq OWNED BY public.gescall_agent_callbacks.id;


--
-- Name: gescall_agent_pause_segments; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.gescall_agent_pause_segments (
    segment_id bigint NOT NULL,
    agent_username character varying(100) NOT NULL,
    pause_code character varying(64) NOT NULL,
    campaign_id character varying(50),
    started_at timestamp with time zone NOT NULL,
    ended_at timestamp with time zone,
    duration_sec integer,
    CONSTRAINT chk_pause_duration_nonneg CHECK (((duration_sec IS NULL) OR (duration_sec >= 0)))
);


--
-- Name: gescall_agent_pause_segments_segment_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.gescall_agent_pause_segments_segment_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: gescall_agent_pause_segments_segment_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.gescall_agent_pause_segments_segment_id_seq OWNED BY public.gescall_agent_pause_segments.segment_id;


--
-- Name: gescall_agent_supervisor_chat_messages; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.gescall_agent_supervisor_chat_messages (
    id bigint NOT NULL,
    campaign_id character varying(64) NOT NULL,
    agent_username character varying(100) NOT NULL,
    sender_user_id integer,
    sender_username character varying(100) NOT NULL,
    sender_role character varying(20) NOT NULL,
    body text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT gescall_agent_supervisor_chat_messages_sender_role_check CHECK (((sender_role)::text = ANY ((ARRAY['AGENT'::character varying, 'SUPERVISOR'::character varying])::text[])))
);


--
-- Name: gescall_agent_supervisor_chat_messages_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.gescall_agent_supervisor_chat_messages_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: gescall_agent_supervisor_chat_messages_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.gescall_agent_supervisor_chat_messages_id_seq OWNED BY public.gescall_agent_supervisor_chat_messages.id;


--
-- Name: gescall_call_log; Type: TABLE; Schema: public; Owner: -
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
    transferred_to character varying(100) DEFAULT ''::character varying,
    trunk_id character varying(50),
    call_direction character varying(10) DEFAULT 'OUTBOUND'::character varying,
    typification_id integer,
    uniqueid character varying(255) DEFAULT NULL::character varying,
    hangup_cause character varying(100)
);


--
-- Name: gescall_call_log_log_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.gescall_call_log_log_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: gescall_call_log_log_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.gescall_call_log_log_id_seq OWNED BY public.gescall_call_log.log_id;


--
-- Name: gescall_callerid_logs; Type: TABLE; Schema: public; Owner: -
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


--
-- Name: gescall_callerid_logs_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.gescall_callerid_logs_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: gescall_callerid_logs_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.gescall_callerid_logs_id_seq OWNED BY public.gescall_callerid_logs.id;


--
-- Name: gescall_callerid_pool_numbers; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.gescall_callerid_pool_numbers (
    id integer NOT NULL,
    pool_id integer NOT NULL,
    callerid character varying(20) NOT NULL,
    is_active boolean DEFAULT true,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    area_code character(3) DEFAULT '000'::bpchar NOT NULL
);


--
-- Name: gescall_callerid_pool_numbers_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.gescall_callerid_pool_numbers_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: gescall_callerid_pool_numbers_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.gescall_callerid_pool_numbers_id_seq OWNED BY public.gescall_callerid_pool_numbers.id;


--
-- Name: gescall_callerid_pools; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.gescall_callerid_pools (
    id integer NOT NULL,
    name character varying(100) NOT NULL,
    description text,
    country_code character varying(10) DEFAULT 'CO'::character varying,
    is_active boolean DEFAULT true,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);


--
-- Name: gescall_callerid_pools_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.gescall_callerid_pools_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: gescall_callerid_pools_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.gescall_callerid_pools_id_seq OWNED BY public.gescall_callerid_pools.id;


--
-- Name: gescall_callerid_usage_log; Type: TABLE; Schema: public; Owner: -
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


--
-- Name: gescall_callerid_usage_log_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.gescall_callerid_usage_log_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: gescall_callerid_usage_log_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.gescall_callerid_usage_log_id_seq OWNED BY public.gescall_callerid_usage_log.id;


--
-- Name: gescall_campaign_callerid_settings; Type: TABLE; Schema: public; Owner: -
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


--
-- Name: gescall_campaign_sessions; Type: TABLE; Schema: public; Owner: -
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


--
-- Name: gescall_campaign_sessions_session_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.gescall_campaign_sessions_session_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: gescall_campaign_sessions_session_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.gescall_campaign_sessions_session_id_seq OWNED BY public.gescall_campaign_sessions.session_id;


--
-- Name: gescall_campaigns; Type: TABLE; Schema: public; Owner: -
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
    alt_phone_enabled boolean DEFAULT false,
    campaign_type character varying(30) DEFAULT 'BLASTER'::character varying,
    moh_class character varying(100),
    moh_custom_file character varying(255),
    recording_settings jsonb DEFAULT '{"enabled": true, "storage": "local", "filename_pattern": "{campaign_name}_{date}_{time}"}'::jsonb,
    predictive_target_drop_rate numeric(3,2) DEFAULT 0.03,
    predictive_min_factor numeric(5,2) DEFAULT 1.0,
    predictive_max_factor numeric(5,2) DEFAULT 4.0,
    predictive_adapt_interval_ms integer DEFAULT 10000,
    predictive_sliding_window_sec integer DEFAULT 300,
    schedule_template_id integer,
    dial_schedule jsonb,
    workspace_daily_target integer DEFAULT 20 NOT NULL,
    pause_settings jsonb DEFAULT '{}'::jsonb NOT NULL,
    teleprompter_template text DEFAULT ''::text NOT NULL,
    teleprompter_dayparts jsonb DEFAULT '{"day": "día", "night": "noche", "day_end": 11, "afternoon": "tarde", "day_start": 6, "night_end": 5, "night_start": 19, "afternoon_end": 18, "afternoon_start": 12}'::jsonb NOT NULL,
    workspace_goal_period_days integer DEFAULT 1 NOT NULL,
    workspace_goal_typification_id integer
);


--
-- Name: gescall_campaigns_prefixes; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.gescall_campaigns_prefixes (
    id integer NOT NULL,
    country_name character varying(100) NOT NULL,
    prefix character varying(10) NOT NULL,
    country_code character varying(5) NOT NULL,
    is_active boolean DEFAULT true,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);


--
-- Name: gescall_campaigns_prefixes_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.gescall_campaigns_prefixes_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: gescall_campaigns_prefixes_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.gescall_campaigns_prefixes_id_seq OWNED BY public.gescall_campaigns_prefixes.id;


--
-- Name: gescall_dispositions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.gescall_dispositions (
    id integer NOT NULL,
    campaign_id character varying(50) NOT NULL,
    code character varying(50) NOT NULL,
    label character varying(255) NOT NULL,
    color character varying(50) DEFAULT 'bg-slate-400'::character varying,
    sort_order integer DEFAULT 0,
    conditions jsonb DEFAULT '{}'::jsonb,
    active boolean DEFAULT true,
    is_default boolean DEFAULT false,
    created_at timestamp without time zone DEFAULT now(),
    updated_at timestamp without time zone DEFAULT now()
);


--
-- Name: gescall_dispositions_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.gescall_dispositions_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: gescall_dispositions_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.gescall_dispositions_id_seq OWNED BY public.gescall_dispositions.id;


--
-- Name: gescall_dnc; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.gescall_dnc (
    id integer NOT NULL,
    phone_number character varying(20) NOT NULL,
    campaign_id character varying(50) DEFAULT NULL::character varying,
    added_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);


--
-- Name: gescall_dnc_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.gescall_dnc_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: gescall_dnc_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.gescall_dnc_id_seq OWNED BY public.gescall_dnc.id;


--
-- Name: gescall_dnc_rules; Type: TABLE; Schema: public; Owner: -
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


--
-- Name: gescall_dnc_rules_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.gescall_dnc_rules_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: gescall_dnc_rules_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.gescall_dnc_rules_id_seq OWNED BY public.gescall_dnc_rules.id;


--
-- Name: gescall_ivr_executions; Type: TABLE; Schema: public; Owner: -
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


--
-- Name: gescall_ivr_executions_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.gescall_ivr_executions_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: gescall_ivr_executions_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.gescall_ivr_executions_id_seq OWNED BY public.gescall_ivr_executions.id;


--
-- Name: gescall_ivr_flows; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.gescall_ivr_flows (
    id integer NOT NULL,
    campaign_id character varying(50) NOT NULL,
    flow_json text NOT NULL,
    is_active boolean DEFAULT true,
    updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);


--
-- Name: gescall_ivr_flows_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.gescall_ivr_flows_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: gescall_ivr_flows_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.gescall_ivr_flows_id_seq OWNED BY public.gescall_ivr_flows.id;


--
-- Name: gescall_leads; Type: TABLE; Schema: public; Owner: -
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


--
-- Name: gescall_leads_lead_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.gescall_leads_lead_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: gescall_leads_lead_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.gescall_leads_lead_id_seq OWNED BY public.gescall_leads.lead_id;


--
-- Name: gescall_lists; Type: TABLE; Schema: public; Owner: -
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


--
-- Name: gescall_report_templates; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.gescall_report_templates (
    id integer NOT NULL,
    name character varying(150) NOT NULL,
    description text,
    scope character varying(30) DEFAULT 'multi_campaign'::character varying NOT NULL,
    definition jsonb DEFAULT '{}'::jsonb NOT NULL,
    owner_user_id integer,
    owner_username character varying(100),
    is_shared boolean DEFAULT true,
    created_at timestamp without time zone DEFAULT now(),
    updated_at timestamp without time zone DEFAULT now()
);


--
-- Name: gescall_report_templates_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.gescall_report_templates_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: gescall_report_templates_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.gescall_report_templates_id_seq OWNED BY public.gescall_report_templates.id;


--
-- Name: gescall_role_permissions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.gescall_role_permissions (
    permission character varying(100) NOT NULL,
    role_id integer NOT NULL
);


--
-- Name: gescall_roles; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.gescall_roles (
    role_name character varying(50) NOT NULL,
    description text,
    is_system boolean DEFAULT false,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    role_id integer NOT NULL
);


--
-- Name: gescall_roles_role_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.gescall_roles_role_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: gescall_roles_role_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.gescall_roles_role_id_seq OWNED BY public.gescall_roles.role_id;


--
-- Name: gescall_route_rules; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.gescall_route_rules (
    id integer NOT NULL,
    direction character varying(16) NOT NULL,
    priority integer DEFAULT 100 NOT NULL,
    active boolean DEFAULT true NOT NULL,
    trunk_id character varying(50),
    match_did character varying(64),
    match_campaign_id character varying(64),
    destination_type character varying(32) NOT NULL,
    destination_campaign_id character varying(64),
    destination_external_number character varying(64),
    description text,
    created_at timestamp without time zone DEFAULT now(),
    updated_at timestamp without time zone DEFAULT now(),
    created_by character varying(100),
    updated_by character varying(100),
    match_did_kind character varying(16) DEFAULT 'EXACT'::character varying NOT NULL,
    CONSTRAINT chk_route_dest_campaign CHECK (((((destination_type)::text = ANY ((ARRAY['CAMPAIGN_QUEUE'::character varying, 'IVR_THEN_QUEUE'::character varying])::text[])) AND (destination_campaign_id IS NOT NULL)) OR ((destination_type)::text <> ALL ((ARRAY['CAMPAIGN_QUEUE'::character varying, 'IVR_THEN_QUEUE'::character varying])::text[])))),
    CONSTRAINT chk_route_destination_type CHECK (((destination_type)::text = ANY ((ARRAY['CAMPAIGN_QUEUE'::character varying, 'IVR_THEN_QUEUE'::character varying, 'EXTERNAL_NUMBER'::character varying, 'OVERRIDE_TRUNK'::character varying])::text[]))),
    CONSTRAINT chk_route_did_kind CHECK (((match_did_kind)::text = ANY ((ARRAY['EXACT'::character varying, 'PREFIX'::character varying, 'REGEX'::character varying])::text[]))),
    CONSTRAINT chk_route_inbound_did CHECK ((((direction)::text <> 'INBOUND'::text) OR (match_did IS NOT NULL))),
    CONSTRAINT chk_route_outbound_campaign CHECK ((((direction)::text <> 'OUTBOUND'::text) OR (match_campaign_id IS NOT NULL))),
    CONSTRAINT gescall_route_rules_direction_check CHECK (((direction)::text = ANY ((ARRAY['INBOUND'::character varying, 'OUTBOUND'::character varying])::text[])))
);


--
-- Name: gescall_route_rules_audit; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.gescall_route_rules_audit (
    audit_id integer NOT NULL,
    rule_id integer,
    action character varying(8) NOT NULL,
    changed_by character varying(100),
    changed_at timestamp without time zone DEFAULT now(),
    old_data jsonb,
    new_data jsonb
);


--
-- Name: gescall_route_rules_audit_audit_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.gescall_route_rules_audit_audit_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: gescall_route_rules_audit_audit_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.gescall_route_rules_audit_audit_id_seq OWNED BY public.gescall_route_rules_audit.audit_id;


--
-- Name: gescall_route_rules_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.gescall_route_rules_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: gescall_route_rules_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.gescall_route_rules_id_seq OWNED BY public.gescall_route_rules.id;


--
-- Name: gescall_schedule_templates; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.gescall_schedule_templates (
    id integer NOT NULL,
    name text NOT NULL,
    description text,
    timezone text DEFAULT 'America/Mexico_City'::text NOT NULL,
    windows jsonb DEFAULT '[]'::jsonb NOT NULL,
    enabled boolean DEFAULT true NOT NULL,
    created_by text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: gescall_schedule_templates_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.gescall_schedule_templates_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: gescall_schedule_templates_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.gescall_schedule_templates_id_seq OWNED BY public.gescall_schedule_templates.id;


--
-- Name: gescall_schedules; Type: TABLE; Schema: public; Owner: -
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


--
-- Name: gescall_schedules_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.gescall_schedules_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: gescall_schedules_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.gescall_schedules_id_seq OWNED BY public.gescall_schedules.id;


--
-- Name: gescall_settings; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.gescall_settings (
    setting_key character varying(50) NOT NULL,
    setting_value text NOT NULL,
    updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);


--
-- Name: gescall_supervisor_notice_dismissals; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.gescall_supervisor_notice_dismissals (
    notice_id integer NOT NULL,
    user_id integer NOT NULL,
    dismissed_at timestamp with time zone DEFAULT now()
);


--
-- Name: gescall_supervisor_notices; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.gescall_supervisor_notices (
    id integer NOT NULL,
    body text NOT NULL,
    campaign_id character varying(64),
    starts_at timestamp with time zone DEFAULT now(),
    ends_at timestamp with time zone,
    active boolean DEFAULT true NOT NULL,
    created_by_user_id integer,
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: gescall_supervisor_notices_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.gescall_supervisor_notices_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: gescall_supervisor_notices_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.gescall_supervisor_notices_id_seq OWNED BY public.gescall_supervisor_notices.id;


--
-- Name: gescall_support_tickets; Type: TABLE; Schema: public; Owner: -
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


--
-- Name: gescall_support_tickets_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.gescall_support_tickets_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: gescall_support_tickets_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.gescall_support_tickets_id_seq OWNED BY public.gescall_support_tickets.id;


--
-- Name: gescall_ticket_comments; Type: TABLE; Schema: public; Owner: -
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


--
-- Name: gescall_ticket_comments_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.gescall_ticket_comments_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: gescall_ticket_comments_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.gescall_ticket_comments_id_seq OWNED BY public.gescall_ticket_comments.id;


--
-- Name: gescall_trunks; Type: TABLE; Schema: public; Owner: -
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


--
-- Name: gescall_tts_nodes; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.gescall_tts_nodes (
    id integer NOT NULL,
    name character varying(100) NOT NULL,
    url character varying(255) NOT NULL,
    is_active boolean DEFAULT true,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);


--
-- Name: gescall_tts_nodes_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.gescall_tts_nodes_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: gescall_tts_nodes_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.gescall_tts_nodes_id_seq OWNED BY public.gescall_tts_nodes.id;


--
-- Name: gescall_typification_form_fields; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.gescall_typification_form_fields (
    id integer NOT NULL,
    form_id integer NOT NULL,
    field_name character varying(100) NOT NULL,
    field_label character varying(255) NOT NULL,
    field_type character varying(50) DEFAULT 'text'::character varying NOT NULL,
    is_required boolean DEFAULT false,
    options jsonb,
    sort_order integer DEFAULT 0,
    created_at timestamp without time zone DEFAULT now()
);


--
-- Name: gescall_typification_form_fields_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.gescall_typification_form_fields_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: gescall_typification_form_fields_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.gescall_typification_form_fields_id_seq OWNED BY public.gescall_typification_form_fields.id;


--
-- Name: gescall_typification_forms; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.gescall_typification_forms (
    id integer NOT NULL,
    campaign_id character varying(50) NOT NULL,
    name character varying(255) NOT NULL,
    description text,
    created_at timestamp without time zone DEFAULT now(),
    updated_at timestamp without time zone DEFAULT now()
);


--
-- Name: gescall_typification_forms_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.gescall_typification_forms_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: gescall_typification_forms_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.gescall_typification_forms_id_seq OWNED BY public.gescall_typification_forms.id;


--
-- Name: gescall_typification_results; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.gescall_typification_results (
    id integer NOT NULL,
    call_log_id integer,
    typification_id integer,
    agent_username character varying(100),
    campaign_id character varying(50),
    form_data jsonb,
    notes text,
    created_at timestamp without time zone DEFAULT now()
);


--
-- Name: gescall_typification_results_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.gescall_typification_results_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: gescall_typification_results_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.gescall_typification_results_id_seq OWNED BY public.gescall_typification_results.id;


--
-- Name: gescall_typifications; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.gescall_typifications (
    id integer NOT NULL,
    campaign_id character varying(50) NOT NULL,
    name character varying(255) NOT NULL,
    category character varying(50) DEFAULT 'Contactado'::character varying NOT NULL,
    form_id integer,
    sort_order integer DEFAULT 0,
    active boolean DEFAULT true,
    created_at timestamp without time zone DEFAULT now(),
    updated_at timestamp without time zone DEFAULT now()
);


--
-- Name: gescall_typifications_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.gescall_typifications_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: gescall_typifications_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.gescall_typifications_id_seq OWNED BY public.gescall_typifications.id;


--
-- Name: gescall_upload_tasks; Type: TABLE; Schema: public; Owner: -
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


--
-- Name: gescall_user_campaigns; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.gescall_user_campaigns (
    user_id integer NOT NULL,
    campaign_id character varying(50) NOT NULL,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);


--
-- Name: gescall_user_widgets; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.gescall_user_widgets (
    user_id integer NOT NULL,
    widgets_data jsonb DEFAULT '{}'::jsonb,
    updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);


--
-- Name: gescall_users; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.gescall_users (
    user_id integer NOT NULL,
    username character varying(50) NOT NULL,
    password_hash character varying(255) NOT NULL,
    active boolean DEFAULT true,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    api_token character varying(255),
    role_id integer NOT NULL,
    sip_extension character varying(50),
    sip_password character varying(255),
    full_name character varying(120)
);


--
-- Name: gescall_users_user_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.gescall_users_user_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: gescall_users_user_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.gescall_users_user_id_seq OWNED BY public.gescall_users.user_id;


--
-- Name: gescall_whitelist_prefixes; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.gescall_whitelist_prefixes (
    id integer NOT NULL,
    prefix character varying(10) NOT NULL,
    description character varying(255),
    is_active boolean DEFAULT true,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);


--
-- Name: gescall_whitelist_prefixes_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.gescall_whitelist_prefixes_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: gescall_whitelist_prefixes_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.gescall_whitelist_prefixes_id_seq OWNED BY public.gescall_whitelist_prefixes.id;


--
-- Name: gescall_agent_callbacks id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.gescall_agent_callbacks ALTER COLUMN id SET DEFAULT nextval('public.gescall_agent_callbacks_id_seq'::regclass);


--
-- Name: gescall_agent_pause_segments segment_id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.gescall_agent_pause_segments ALTER COLUMN segment_id SET DEFAULT nextval('public.gescall_agent_pause_segments_segment_id_seq'::regclass);


--
-- Name: gescall_agent_supervisor_chat_messages id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.gescall_agent_supervisor_chat_messages ALTER COLUMN id SET DEFAULT nextval('public.gescall_agent_supervisor_chat_messages_id_seq'::regclass);


--
-- Name: gescall_call_log log_id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.gescall_call_log ALTER COLUMN log_id SET DEFAULT nextval('public.gescall_call_log_log_id_seq'::regclass);


--
-- Name: gescall_callerid_logs id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.gescall_callerid_logs ALTER COLUMN id SET DEFAULT nextval('public.gescall_callerid_logs_id_seq'::regclass);


--
-- Name: gescall_callerid_pool_numbers id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.gescall_callerid_pool_numbers ALTER COLUMN id SET DEFAULT nextval('public.gescall_callerid_pool_numbers_id_seq'::regclass);


--
-- Name: gescall_callerid_pools id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.gescall_callerid_pools ALTER COLUMN id SET DEFAULT nextval('public.gescall_callerid_pools_id_seq'::regclass);


--
-- Name: gescall_callerid_usage_log id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.gescall_callerid_usage_log ALTER COLUMN id SET DEFAULT nextval('public.gescall_callerid_usage_log_id_seq'::regclass);


--
-- Name: gescall_campaign_sessions session_id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.gescall_campaign_sessions ALTER COLUMN session_id SET DEFAULT nextval('public.gescall_campaign_sessions_session_id_seq'::regclass);


--
-- Name: gescall_campaigns_prefixes id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.gescall_campaigns_prefixes ALTER COLUMN id SET DEFAULT nextval('public.gescall_campaigns_prefixes_id_seq'::regclass);


--
-- Name: gescall_dispositions id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.gescall_dispositions ALTER COLUMN id SET DEFAULT nextval('public.gescall_dispositions_id_seq'::regclass);


--
-- Name: gescall_dnc id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.gescall_dnc ALTER COLUMN id SET DEFAULT nextval('public.gescall_dnc_id_seq'::regclass);


--
-- Name: gescall_dnc_rules id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.gescall_dnc_rules ALTER COLUMN id SET DEFAULT nextval('public.gescall_dnc_rules_id_seq'::regclass);


--
-- Name: gescall_ivr_executions id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.gescall_ivr_executions ALTER COLUMN id SET DEFAULT nextval('public.gescall_ivr_executions_id_seq'::regclass);


--
-- Name: gescall_ivr_flows id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.gescall_ivr_flows ALTER COLUMN id SET DEFAULT nextval('public.gescall_ivr_flows_id_seq'::regclass);


--
-- Name: gescall_leads lead_id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.gescall_leads ALTER COLUMN lead_id SET DEFAULT nextval('public.gescall_leads_lead_id_seq'::regclass);


--
-- Name: gescall_report_templates id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.gescall_report_templates ALTER COLUMN id SET DEFAULT nextval('public.gescall_report_templates_id_seq'::regclass);


--
-- Name: gescall_roles role_id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.gescall_roles ALTER COLUMN role_id SET DEFAULT nextval('public.gescall_roles_role_id_seq'::regclass);


--
-- Name: gescall_route_rules id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.gescall_route_rules ALTER COLUMN id SET DEFAULT nextval('public.gescall_route_rules_id_seq'::regclass);


--
-- Name: gescall_route_rules_audit audit_id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.gescall_route_rules_audit ALTER COLUMN audit_id SET DEFAULT nextval('public.gescall_route_rules_audit_audit_id_seq'::regclass);


--
-- Name: gescall_schedule_templates id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.gescall_schedule_templates ALTER COLUMN id SET DEFAULT nextval('public.gescall_schedule_templates_id_seq'::regclass);


--
-- Name: gescall_schedules id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.gescall_schedules ALTER COLUMN id SET DEFAULT nextval('public.gescall_schedules_id_seq'::regclass);


--
-- Name: gescall_supervisor_notices id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.gescall_supervisor_notices ALTER COLUMN id SET DEFAULT nextval('public.gescall_supervisor_notices_id_seq'::regclass);


--
-- Name: gescall_support_tickets id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.gescall_support_tickets ALTER COLUMN id SET DEFAULT nextval('public.gescall_support_tickets_id_seq'::regclass);


--
-- Name: gescall_ticket_comments id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.gescall_ticket_comments ALTER COLUMN id SET DEFAULT nextval('public.gescall_ticket_comments_id_seq'::regclass);


--
-- Name: gescall_tts_nodes id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.gescall_tts_nodes ALTER COLUMN id SET DEFAULT nextval('public.gescall_tts_nodes_id_seq'::regclass);


--
-- Name: gescall_typification_form_fields id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.gescall_typification_form_fields ALTER COLUMN id SET DEFAULT nextval('public.gescall_typification_form_fields_id_seq'::regclass);


--
-- Name: gescall_typification_forms id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.gescall_typification_forms ALTER COLUMN id SET DEFAULT nextval('public.gescall_typification_forms_id_seq'::regclass);


--
-- Name: gescall_typification_results id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.gescall_typification_results ALTER COLUMN id SET DEFAULT nextval('public.gescall_typification_results_id_seq'::regclass);


--
-- Name: gescall_typifications id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.gescall_typifications ALTER COLUMN id SET DEFAULT nextval('public.gescall_typifications_id_seq'::regclass);


--
-- Name: gescall_users user_id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.gescall_users ALTER COLUMN user_id SET DEFAULT nextval('public.gescall_users_user_id_seq'::regclass);


--
-- Name: gescall_whitelist_prefixes id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.gescall_whitelist_prefixes ALTER COLUMN id SET DEFAULT nextval('public.gescall_whitelist_prefixes_id_seq'::regclass);


--
-- Name: gescall_agent_callbacks gescall_agent_callbacks_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.gescall_agent_callbacks
    ADD CONSTRAINT gescall_agent_callbacks_pkey PRIMARY KEY (id);


--
-- Name: gescall_agent_pause_segments gescall_agent_pause_segments_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.gescall_agent_pause_segments
    ADD CONSTRAINT gescall_agent_pause_segments_pkey PRIMARY KEY (segment_id);


--
-- Name: gescall_agent_supervisor_chat_messages gescall_agent_supervisor_chat_messages_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.gescall_agent_supervisor_chat_messages
    ADD CONSTRAINT gescall_agent_supervisor_chat_messages_pkey PRIMARY KEY (id);


--
-- Name: gescall_call_log gescall_call_log_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.gescall_call_log
    ADD CONSTRAINT gescall_call_log_pkey PRIMARY KEY (log_id);


--
-- Name: gescall_callerid_logs gescall_callerid_logs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.gescall_callerid_logs
    ADD CONSTRAINT gescall_callerid_logs_pkey PRIMARY KEY (id);


--
-- Name: gescall_callerid_pool_numbers gescall_callerid_pool_numbers_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.gescall_callerid_pool_numbers
    ADD CONSTRAINT gescall_callerid_pool_numbers_pkey PRIMARY KEY (id);


--
-- Name: gescall_callerid_pool_numbers gescall_callerid_pool_numbers_pool_id_callerid_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.gescall_callerid_pool_numbers
    ADD CONSTRAINT gescall_callerid_pool_numbers_pool_id_callerid_key UNIQUE (pool_id, callerid);


--
-- Name: gescall_callerid_pools gescall_callerid_pools_name_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.gescall_callerid_pools
    ADD CONSTRAINT gescall_callerid_pools_name_key UNIQUE (name);


--
-- Name: gescall_callerid_pools gescall_callerid_pools_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.gescall_callerid_pools
    ADD CONSTRAINT gescall_callerid_pools_pkey PRIMARY KEY (id);


--
-- Name: gescall_callerid_usage_log gescall_callerid_usage_log_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.gescall_callerid_usage_log
    ADD CONSTRAINT gescall_callerid_usage_log_pkey PRIMARY KEY (id);


--
-- Name: gescall_campaign_callerid_settings gescall_campaign_callerid_settings_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.gescall_campaign_callerid_settings
    ADD CONSTRAINT gescall_campaign_callerid_settings_pkey PRIMARY KEY (campaign_id);


--
-- Name: gescall_campaign_sessions gescall_campaign_sessions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.gescall_campaign_sessions
    ADD CONSTRAINT gescall_campaign_sessions_pkey PRIMARY KEY (session_id);


--
-- Name: gescall_campaigns gescall_campaigns_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.gescall_campaigns
    ADD CONSTRAINT gescall_campaigns_pkey PRIMARY KEY (campaign_id);


--
-- Name: gescall_campaigns_prefixes gescall_campaigns_prefixes_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.gescall_campaigns_prefixes
    ADD CONSTRAINT gescall_campaigns_prefixes_pkey PRIMARY KEY (id);


--
-- Name: gescall_campaigns_prefixes gescall_campaigns_prefixes_prefix_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.gescall_campaigns_prefixes
    ADD CONSTRAINT gescall_campaigns_prefixes_prefix_key UNIQUE (prefix);


--
-- Name: gescall_dispositions gescall_dispositions_campaign_id_code_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.gescall_dispositions
    ADD CONSTRAINT gescall_dispositions_campaign_id_code_key UNIQUE (campaign_id, code);


--
-- Name: gescall_dispositions gescall_dispositions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.gescall_dispositions
    ADD CONSTRAINT gescall_dispositions_pkey PRIMARY KEY (id);


--
-- Name: gescall_dnc gescall_dnc_phone_number_campaign_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.gescall_dnc
    ADD CONSTRAINT gescall_dnc_phone_number_campaign_id_key UNIQUE (phone_number, campaign_id);


--
-- Name: gescall_dnc gescall_dnc_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.gescall_dnc
    ADD CONSTRAINT gescall_dnc_pkey PRIMARY KEY (id);


--
-- Name: gescall_dnc_rules gescall_dnc_rules_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.gescall_dnc_rules
    ADD CONSTRAINT gescall_dnc_rules_pkey PRIMARY KEY (id);


--
-- Name: gescall_ivr_executions gescall_ivr_executions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.gescall_ivr_executions
    ADD CONSTRAINT gescall_ivr_executions_pkey PRIMARY KEY (id);


--
-- Name: gescall_ivr_flows gescall_ivr_flows_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.gescall_ivr_flows
    ADD CONSTRAINT gescall_ivr_flows_pkey PRIMARY KEY (id);


--
-- Name: gescall_leads gescall_leads_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.gescall_leads
    ADD CONSTRAINT gescall_leads_pkey PRIMARY KEY (lead_id);


--
-- Name: gescall_lists gescall_lists_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.gescall_lists
    ADD CONSTRAINT gescall_lists_pkey PRIMARY KEY (list_id);


--
-- Name: gescall_report_templates gescall_report_templates_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.gescall_report_templates
    ADD CONSTRAINT gescall_report_templates_pkey PRIMARY KEY (id);


--
-- Name: gescall_role_permissions gescall_role_permissions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.gescall_role_permissions
    ADD CONSTRAINT gescall_role_permissions_pkey PRIMARY KEY (role_id, permission);


--
-- Name: gescall_roles gescall_roles_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.gescall_roles
    ADD CONSTRAINT gescall_roles_pkey PRIMARY KEY (role_id);


--
-- Name: gescall_roles gescall_roles_role_name_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.gescall_roles
    ADD CONSTRAINT gescall_roles_role_name_key UNIQUE (role_name);


--
-- Name: gescall_route_rules_audit gescall_route_rules_audit_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.gescall_route_rules_audit
    ADD CONSTRAINT gescall_route_rules_audit_pkey PRIMARY KEY (audit_id);


--
-- Name: gescall_route_rules gescall_route_rules_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.gescall_route_rules
    ADD CONSTRAINT gescall_route_rules_pkey PRIMARY KEY (id);


--
-- Name: gescall_schedule_templates gescall_schedule_templates_name_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.gescall_schedule_templates
    ADD CONSTRAINT gescall_schedule_templates_name_key UNIQUE (name);


--
-- Name: gescall_schedule_templates gescall_schedule_templates_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.gescall_schedule_templates
    ADD CONSTRAINT gescall_schedule_templates_pkey PRIMARY KEY (id);


--
-- Name: gescall_schedules gescall_schedules_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.gescall_schedules
    ADD CONSTRAINT gescall_schedules_pkey PRIMARY KEY (id);


--
-- Name: gescall_settings gescall_settings_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.gescall_settings
    ADD CONSTRAINT gescall_settings_pkey PRIMARY KEY (setting_key);


--
-- Name: gescall_supervisor_notice_dismissals gescall_supervisor_notice_dismissals_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.gescall_supervisor_notice_dismissals
    ADD CONSTRAINT gescall_supervisor_notice_dismissals_pkey PRIMARY KEY (notice_id, user_id);


--
-- Name: gescall_supervisor_notices gescall_supervisor_notices_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.gescall_supervisor_notices
    ADD CONSTRAINT gescall_supervisor_notices_pkey PRIMARY KEY (id);


--
-- Name: gescall_support_tickets gescall_support_tickets_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.gescall_support_tickets
    ADD CONSTRAINT gescall_support_tickets_pkey PRIMARY KEY (id);


--
-- Name: gescall_ticket_comments gescall_ticket_comments_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.gescall_ticket_comments
    ADD CONSTRAINT gescall_ticket_comments_pkey PRIMARY KEY (id);


--
-- Name: gescall_trunks gescall_trunks_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.gescall_trunks
    ADD CONSTRAINT gescall_trunks_pkey PRIMARY KEY (trunk_id);


--
-- Name: gescall_tts_nodes gescall_tts_nodes_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.gescall_tts_nodes
    ADD CONSTRAINT gescall_tts_nodes_pkey PRIMARY KEY (id);


--
-- Name: gescall_typification_form_fields gescall_typification_form_fields_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.gescall_typification_form_fields
    ADD CONSTRAINT gescall_typification_form_fields_pkey PRIMARY KEY (id);


--
-- Name: gescall_typification_forms gescall_typification_forms_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.gescall_typification_forms
    ADD CONSTRAINT gescall_typification_forms_pkey PRIMARY KEY (id);


--
-- Name: gescall_typification_results gescall_typification_results_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.gescall_typification_results
    ADD CONSTRAINT gescall_typification_results_pkey PRIMARY KEY (id);


--
-- Name: gescall_typifications gescall_typifications_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.gescall_typifications
    ADD CONSTRAINT gescall_typifications_pkey PRIMARY KEY (id);


--
-- Name: gescall_upload_tasks gescall_upload_tasks_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.gescall_upload_tasks
    ADD CONSTRAINT gescall_upload_tasks_pkey PRIMARY KEY (id);


--
-- Name: gescall_user_campaigns gescall_user_campaigns_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.gescall_user_campaigns
    ADD CONSTRAINT gescall_user_campaigns_pkey PRIMARY KEY (user_id, campaign_id);


--
-- Name: gescall_user_widgets gescall_user_widgets_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.gescall_user_widgets
    ADD CONSTRAINT gescall_user_widgets_pkey PRIMARY KEY (user_id);


--
-- Name: gescall_users gescall_users_api_token_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.gescall_users
    ADD CONSTRAINT gescall_users_api_token_key UNIQUE (api_token);


--
-- Name: gescall_users gescall_users_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.gescall_users
    ADD CONSTRAINT gescall_users_pkey PRIMARY KEY (user_id);


--
-- Name: gescall_users gescall_users_username_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.gescall_users
    ADD CONSTRAINT gescall_users_username_key UNIQUE (username);


--
-- Name: gescall_whitelist_prefixes gescall_whitelist_prefixes_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.gescall_whitelist_prefixes
    ADD CONSTRAINT gescall_whitelist_prefixes_pkey PRIMARY KEY (id);


--
-- Name: gescall_whitelist_prefixes gescall_whitelist_prefixes_prefix_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.gescall_whitelist_prefixes
    ADD CONSTRAINT gescall_whitelist_prefixes_prefix_key UNIQUE (prefix);


--
-- Name: idx_agent_callbacks_assignee; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_agent_callbacks_assignee ON public.gescall_agent_callbacks USING btree (assignee_user_id, status, scheduled_at);


--
-- Name: idx_agent_pause_segments_agent_time; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_agent_pause_segments_agent_time ON public.gescall_agent_pause_segments USING btree (agent_username, started_at DESC);


--
-- Name: idx_agent_pause_segments_campaign; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_agent_pause_segments_campaign ON public.gescall_agent_pause_segments USING btree (campaign_id, started_at DESC) WHERE (campaign_id IS NOT NULL);


--
-- Name: idx_agent_pause_segments_open; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_agent_pause_segments_open ON public.gescall_agent_pause_segments USING btree (agent_username) WHERE (ended_at IS NULL);


--
-- Name: idx_agent_supervisor_chat_sender; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_agent_supervisor_chat_sender ON public.gescall_agent_supervisor_chat_messages USING btree (sender_user_id, created_at DESC);


--
-- Name: idx_agent_supervisor_chat_thread; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_agent_supervisor_chat_thread ON public.gescall_agent_supervisor_chat_messages USING btree (campaign_id, agent_username, created_at DESC);


--
-- Name: idx_call_log_phone_date; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_call_log_phone_date ON public.gescall_call_log USING btree (phone_number, call_date);


--
-- Name: idx_campaign_sessions_camp; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_campaign_sessions_camp ON public.gescall_campaign_sessions USING btree (campaign_id);


--
-- Name: idx_cid_log_callerid; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_cid_log_callerid ON public.gescall_callerid_usage_log USING btree (callerid_used);


--
-- Name: idx_cid_log_campaign_date; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_cid_log_campaign_date ON public.gescall_callerid_usage_log USING btree (campaign_id, created_at);


--
-- Name: idx_dispositions_campaign; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_dispositions_campaign ON public.gescall_dispositions USING btree (campaign_id);


--
-- Name: idx_dispositions_sort; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_dispositions_sort ON public.gescall_dispositions USING btree (campaign_id, sort_order);


--
-- Name: idx_dnc_campaign; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_dnc_campaign ON public.gescall_dnc USING btree (campaign_id);


--
-- Name: idx_dnc_phone; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_dnc_phone ON public.gescall_dnc USING btree (phone_number);


--
-- Name: idx_form_fields_form; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_form_fields_form ON public.gescall_typification_form_fields USING btree (form_id);


--
-- Name: idx_gescall_call_log_camp_date; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_gescall_call_log_camp_date ON public.gescall_call_log USING btree (campaign_id, call_date DESC);


--
-- Name: idx_gescall_call_log_direction; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_gescall_call_log_direction ON public.gescall_call_log USING btree (call_direction);


--
-- Name: idx_gescall_call_log_lead_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_gescall_call_log_lead_id ON public.gescall_call_log USING btree (lead_id);


--
-- Name: idx_gescall_call_log_list_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_gescall_call_log_list_id ON public.gescall_call_log USING btree (list_id);


--
-- Name: idx_gescall_campaigns_schedule_template_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_gescall_campaigns_schedule_template_id ON public.gescall_campaigns USING btree (schedule_template_id);


--
-- Name: idx_gescall_ivr_flows_campaign_id; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX idx_gescall_ivr_flows_campaign_id ON public.gescall_ivr_flows USING btree (campaign_id);


--
-- Name: idx_gescall_leads_list_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_gescall_leads_list_id ON public.gescall_leads USING btree (list_id);


--
-- Name: idx_leads_status_list; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_leads_status_list ON public.gescall_leads USING btree (status, list_id);


--
-- Name: idx_report_templates_owner; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_report_templates_owner ON public.gescall_report_templates USING btree (owner_user_id);


--
-- Name: idx_report_templates_shared; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_report_templates_shared ON public.gescall_report_templates USING btree (is_shared);


--
-- Name: idx_route_audit_changed_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_route_audit_changed_at ON public.gescall_route_rules_audit USING btree (changed_at DESC);


--
-- Name: idx_route_audit_rule; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_route_audit_rule ON public.gescall_route_rules_audit USING btree (rule_id, changed_at DESC);


--
-- Name: idx_route_rules_inbound; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_route_rules_inbound ON public.gescall_route_rules USING btree (direction, active, match_did) WHERE ((direction)::text = 'INBOUND'::text);


--
-- Name: idx_route_rules_outbound; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_route_rules_outbound ON public.gescall_route_rules USING btree (direction, active, match_campaign_id) WHERE ((direction)::text = 'OUTBOUND'::text);


--
-- Name: idx_supervisor_notices_active; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_supervisor_notices_active ON public.gescall_supervisor_notices USING btree (active, starts_at, ends_at);


--
-- Name: idx_supervisor_notices_campaign; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_supervisor_notices_campaign ON public.gescall_supervisor_notices USING btree (campaign_id);


--
-- Name: idx_ticket_comments_ticket_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_ticket_comments_ticket_id ON public.gescall_ticket_comments USING btree (ticket_id);


--
-- Name: idx_tickets_created_by; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_tickets_created_by ON public.gescall_support_tickets USING btree (created_by);


--
-- Name: idx_tickets_jira_key; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_tickets_jira_key ON public.gescall_support_tickets USING btree (jira_key);


--
-- Name: idx_tickets_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_tickets_status ON public.gescall_support_tickets USING btree (status);


--
-- Name: idx_typification_forms_campaign; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_typification_forms_campaign ON public.gescall_typification_forms USING btree (campaign_id);


--
-- Name: idx_typification_results_call_log; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_typification_results_call_log ON public.gescall_typification_results USING btree (call_log_id);


--
-- Name: idx_typification_results_campaign; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_typification_results_campaign ON public.gescall_typification_results USING btree (campaign_id);


--
-- Name: idx_typifications_campaign; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_typifications_campaign ON public.gescall_typifications USING btree (campaign_id);


--
-- Name: gescall_route_rules gescall_route_rules_audit_tg; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER gescall_route_rules_audit_tg AFTER INSERT OR DELETE OR UPDATE ON public.gescall_route_rules FOR EACH ROW EXECUTE FUNCTION public.gescall_route_rules_audit_fn();


--
-- Name: gescall_schedule_templates trg_gescall_schedule_template_propagate; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_gescall_schedule_template_propagate BEFORE UPDATE ON public.gescall_schedule_templates FOR EACH ROW EXECUTE FUNCTION public.gescall_propagate_schedule_template_changes();


--
-- Name: gescall_role_permissions fk_permissions_role_id; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.gescall_role_permissions
    ADD CONSTRAINT fk_permissions_role_id FOREIGN KEY (role_id) REFERENCES public.gescall_roles(role_id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: gescall_typifications fk_typifications_form; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.gescall_typifications
    ADD CONSTRAINT fk_typifications_form FOREIGN KEY (form_id) REFERENCES public.gescall_typification_forms(id) ON DELETE SET NULL;


--
-- Name: gescall_users fk_users_role_id; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.gescall_users
    ADD CONSTRAINT fk_users_role_id FOREIGN KEY (role_id) REFERENCES public.gescall_roles(role_id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: gescall_campaigns fk_workspace_goal_typification; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.gescall_campaigns
    ADD CONSTRAINT fk_workspace_goal_typification FOREIGN KEY (workspace_goal_typification_id) REFERENCES public.gescall_typifications(id) ON DELETE SET NULL;


--
-- Name: gescall_agent_callbacks gescall_agent_callbacks_assignee_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.gescall_agent_callbacks
    ADD CONSTRAINT gescall_agent_callbacks_assignee_user_id_fkey FOREIGN KEY (assignee_user_id) REFERENCES public.gescall_users(user_id) ON DELETE CASCADE;


--
-- Name: gescall_agent_callbacks gescall_agent_callbacks_campaign_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.gescall_agent_callbacks
    ADD CONSTRAINT gescall_agent_callbacks_campaign_id_fkey FOREIGN KEY (campaign_id) REFERENCES public.gescall_campaigns(campaign_id) ON DELETE SET NULL;


--
-- Name: gescall_agent_callbacks gescall_agent_callbacks_created_by_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.gescall_agent_callbacks
    ADD CONSTRAINT gescall_agent_callbacks_created_by_user_id_fkey FOREIGN KEY (created_by_user_id) REFERENCES public.gescall_users(user_id) ON DELETE SET NULL;


--
-- Name: gescall_agent_supervisor_chat_messages gescall_agent_supervisor_chat_messages_campaign_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.gescall_agent_supervisor_chat_messages
    ADD CONSTRAINT gescall_agent_supervisor_chat_messages_campaign_id_fkey FOREIGN KEY (campaign_id) REFERENCES public.gescall_campaigns(campaign_id) ON DELETE CASCADE;


--
-- Name: gescall_agent_supervisor_chat_messages gescall_agent_supervisor_chat_messages_sender_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.gescall_agent_supervisor_chat_messages
    ADD CONSTRAINT gescall_agent_supervisor_chat_messages_sender_user_id_fkey FOREIGN KEY (sender_user_id) REFERENCES public.gescall_users(user_id) ON DELETE SET NULL;


--
-- Name: gescall_callerid_logs gescall_callerid_logs_pool_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.gescall_callerid_logs
    ADD CONSTRAINT gescall_callerid_logs_pool_id_fkey FOREIGN KEY (pool_id) REFERENCES public.gescall_callerid_pools(id) ON DELETE SET NULL;


--
-- Name: gescall_callerid_pool_numbers gescall_callerid_pool_numbers_pool_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.gescall_callerid_pool_numbers
    ADD CONSTRAINT gescall_callerid_pool_numbers_pool_id_fkey FOREIGN KEY (pool_id) REFERENCES public.gescall_callerid_pools(id) ON DELETE CASCADE;


--
-- Name: gescall_campaign_callerid_settings gescall_campaign_callerid_settings_campaign_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.gescall_campaign_callerid_settings
    ADD CONSTRAINT gescall_campaign_callerid_settings_campaign_id_fkey FOREIGN KEY (campaign_id) REFERENCES public.gescall_campaigns(campaign_id) ON DELETE CASCADE;


--
-- Name: gescall_campaign_callerid_settings gescall_campaign_callerid_settings_pool_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.gescall_campaign_callerid_settings
    ADD CONSTRAINT gescall_campaign_callerid_settings_pool_id_fkey FOREIGN KEY (pool_id) REFERENCES public.gescall_callerid_pools(id) ON DELETE SET NULL;


--
-- Name: gescall_campaign_sessions gescall_campaign_sessions_campaign_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.gescall_campaign_sessions
    ADD CONSTRAINT gescall_campaign_sessions_campaign_id_fkey FOREIGN KEY (campaign_id) REFERENCES public.gescall_campaigns(campaign_id);


--
-- Name: gescall_campaigns gescall_campaigns_schedule_template_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.gescall_campaigns
    ADD CONSTRAINT gescall_campaigns_schedule_template_id_fkey FOREIGN KEY (schedule_template_id) REFERENCES public.gescall_schedule_templates(id) ON DELETE SET NULL;


--
-- Name: gescall_dispositions gescall_dispositions_campaign_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.gescall_dispositions
    ADD CONSTRAINT gescall_dispositions_campaign_id_fkey FOREIGN KEY (campaign_id) REFERENCES public.gescall_campaigns(campaign_id) ON DELETE CASCADE;


--
-- Name: gescall_ivr_flows gescall_ivr_flows_campaign_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.gescall_ivr_flows
    ADD CONSTRAINT gescall_ivr_flows_campaign_id_fkey FOREIGN KEY (campaign_id) REFERENCES public.gescall_campaigns(campaign_id) ON DELETE CASCADE;


--
-- Name: gescall_leads gescall_leads_list_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.gescall_leads
    ADD CONSTRAINT gescall_leads_list_id_fkey FOREIGN KEY (list_id) REFERENCES public.gescall_lists(list_id) ON DELETE CASCADE;


--
-- Name: gescall_lists gescall_lists_campaign_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.gescall_lists
    ADD CONSTRAINT gescall_lists_campaign_id_fkey FOREIGN KEY (campaign_id) REFERENCES public.gescall_campaigns(campaign_id) ON DELETE CASCADE;


--
-- Name: gescall_report_templates gescall_report_templates_owner_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.gescall_report_templates
    ADD CONSTRAINT gescall_report_templates_owner_user_id_fkey FOREIGN KEY (owner_user_id) REFERENCES public.gescall_users(user_id) ON DELETE SET NULL;


--
-- Name: gescall_route_rules gescall_route_rules_destination_campaign_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.gescall_route_rules
    ADD CONSTRAINT gescall_route_rules_destination_campaign_id_fkey FOREIGN KEY (destination_campaign_id) REFERENCES public.gescall_campaigns(campaign_id) ON DELETE SET NULL;


--
-- Name: gescall_route_rules gescall_route_rules_match_campaign_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.gescall_route_rules
    ADD CONSTRAINT gescall_route_rules_match_campaign_id_fkey FOREIGN KEY (match_campaign_id) REFERENCES public.gescall_campaigns(campaign_id) ON DELETE CASCADE;


--
-- Name: gescall_route_rules gescall_route_rules_trunk_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.gescall_route_rules
    ADD CONSTRAINT gescall_route_rules_trunk_id_fkey FOREIGN KEY (trunk_id) REFERENCES public.gescall_trunks(trunk_id) ON DELETE SET NULL;


--
-- Name: gescall_supervisor_notice_dismissals gescall_supervisor_notice_dismissals_notice_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.gescall_supervisor_notice_dismissals
    ADD CONSTRAINT gescall_supervisor_notice_dismissals_notice_id_fkey FOREIGN KEY (notice_id) REFERENCES public.gescall_supervisor_notices(id) ON DELETE CASCADE;


--
-- Name: gescall_supervisor_notice_dismissals gescall_supervisor_notice_dismissals_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.gescall_supervisor_notice_dismissals
    ADD CONSTRAINT gescall_supervisor_notice_dismissals_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.gescall_users(user_id) ON DELETE CASCADE;


--
-- Name: gescall_supervisor_notices gescall_supervisor_notices_campaign_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.gescall_supervisor_notices
    ADD CONSTRAINT gescall_supervisor_notices_campaign_id_fkey FOREIGN KEY (campaign_id) REFERENCES public.gescall_campaigns(campaign_id) ON DELETE CASCADE;


--
-- Name: gescall_supervisor_notices gescall_supervisor_notices_created_by_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.gescall_supervisor_notices
    ADD CONSTRAINT gescall_supervisor_notices_created_by_user_id_fkey FOREIGN KEY (created_by_user_id) REFERENCES public.gescall_users(user_id) ON DELETE SET NULL;


--
-- Name: gescall_ticket_comments gescall_ticket_comments_ticket_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.gescall_ticket_comments
    ADD CONSTRAINT gescall_ticket_comments_ticket_id_fkey FOREIGN KEY (ticket_id) REFERENCES public.gescall_support_tickets(id) ON DELETE CASCADE;


--
-- Name: gescall_typification_form_fields gescall_typification_form_fields_form_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.gescall_typification_form_fields
    ADD CONSTRAINT gescall_typification_form_fields_form_id_fkey FOREIGN KEY (form_id) REFERENCES public.gescall_typification_forms(id) ON DELETE CASCADE;


--
-- Name: gescall_typification_forms gescall_typification_forms_campaign_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.gescall_typification_forms
    ADD CONSTRAINT gescall_typification_forms_campaign_id_fkey FOREIGN KEY (campaign_id) REFERENCES public.gescall_campaigns(campaign_id) ON DELETE CASCADE;


--
-- Name: gescall_typification_results gescall_typification_results_call_log_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.gescall_typification_results
    ADD CONSTRAINT gescall_typification_results_call_log_id_fkey FOREIGN KEY (call_log_id) REFERENCES public.gescall_call_log(log_id) ON DELETE SET NULL;


--
-- Name: gescall_typification_results gescall_typification_results_typification_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.gescall_typification_results
    ADD CONSTRAINT gescall_typification_results_typification_id_fkey FOREIGN KEY (typification_id) REFERENCES public.gescall_typifications(id) ON DELETE SET NULL;


--
-- Name: gescall_typifications gescall_typifications_campaign_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.gescall_typifications
    ADD CONSTRAINT gescall_typifications_campaign_id_fkey FOREIGN KEY (campaign_id) REFERENCES public.gescall_campaigns(campaign_id) ON DELETE CASCADE;


--
-- Name: gescall_user_campaigns gescall_user_campaigns_campaign_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.gescall_user_campaigns
    ADD CONSTRAINT gescall_user_campaigns_campaign_id_fkey FOREIGN KEY (campaign_id) REFERENCES public.gescall_campaigns(campaign_id) ON DELETE CASCADE;


--
-- Name: gescall_user_campaigns gescall_user_campaigns_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.gescall_user_campaigns
    ADD CONSTRAINT gescall_user_campaigns_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.gescall_users(user_id) ON DELETE CASCADE;


--
-- Name: gescall_user_widgets gescall_user_widgets_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.gescall_user_widgets
    ADD CONSTRAINT gescall_user_widgets_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.gescall_users(user_id) ON DELETE CASCADE;


--
-- PostgreSQL database dump complete
--

\unrestrict BwaWL4qRFYRpUGZWhxcBiH75daHMtNwReHt2YBaMh08W7y2CvKOT2reuJ69f73u

