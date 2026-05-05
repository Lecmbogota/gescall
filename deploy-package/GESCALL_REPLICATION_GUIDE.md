# GesCall — Asterisk + ARI + PostgreSQL

> **2026:** Marcación saliente/entrante, IVR, TTS y registro en BD los conduce el **backend Node** vía **ARI (Stasis)**, aplicación `gescall-ivr` (`back/services/ariService.js`). **No se requieren AGIs** en el flujo nativo: Asterisk solo debe poder llegar a esa app (originate / contexto que encaje con vuestro troncal).

## `deploy-package/`

| Ruta | Uso |
|------|-----|
| `install.sh` | Dialplan mínimo + directorio TTS; **no** copia AGIs ni usa MySQL. |
| `asterisk/extensions-gescall.conf` | Contexto **`[trunkinbound]`** → `Stasis(gescall-ivr,inbound,${EXTEN})` (alineado con `context=trunkinbound` en PJSIP del panel). Saliente: originate vía ARI (dialer Go), no este dialplan. |

## PostgreSQL

- `back/.env` y migraciones en `back/migrations/`.
- Auxiliar: `back/scripts/migrate_aux_tables_pg.sql` (`psql -f ...`).

## ARI (obligatorio para IVR)

Variables típicas en `back/.env`:

- `ARI_URL`, `ARI_USER`, `ARI_PASS`
- El servicio registra la app Stasis **`gescall-ivr`** (ver logs al arrancar `server.js`).

- **Saliente:** el **dialer Go** hace `Originate` a `app=gescall-ivr` con `appArgs=outbound` y variables (`leadid`, `campaign_id`, `GESCALL_NATIVE`, etc.).
- **Entrante:** el troncal entra en `[trunkinbound]`; el tercer argumento de Stasis es el **DID** que `ariService.js` usa con `gescall_inbound_dids`. Si el operador solo entrega extensión `s`, puede hacer falta ajustar el dialplan (p. ej. `CALLERID(dnid)`).

## Verificación

```bash
grep -q 'extensions-gescall.conf' /etc/asterisk/extensions.conf && echo "include OK" || echo "falta include"
asterisk -rx 'stasis show apps' 2>/dev/null | grep -i gescall || true
psql -U gescall_admin -h localhost -d gescall_db -c "\dt gescall_*" 2>/dev/null | head
```

## Checklist

- [ ] PostgreSQL + migraciones.
- [ ] Node (`gescall-backend`) con ARI conectado a Asterisk.
- [ ] Dialplan include + reload.
- [ ] Go dialer / troncales enviando canales a **Stasis `gescall-ivr`**.
- [ ] Redis (hopper / estado) según despliegue.
- [ ] Piper / `PIPER_TTS_URL` para TTS desde ARI.

## Más documentación

- `/opt/gescall/AGENTS.md`
