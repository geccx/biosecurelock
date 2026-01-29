# Sync & Local Data Retention API

APIs for credential sync, log retrieval, device status, and sync queue management. Used for TUYA-integrated smart lock local data retention and continuous logging.

Reference: [Tuya Cloud Development](https://developer.tuya.com/en/docs/cloud)

## Credential Sync (admin / tech support)

| Method | Path                                                                        | Description                                                                          |
| ------ | --------------------------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| POST   | `/api/sync/credentials/sync`                                                | Sync a credential to device(s). Body: `{ credentialType, credentialId, deviceIds? }` |
| GET    | `/api/sync/credentials/sync-status/:id?type=enrollment\|temporary_password` | Get sync status for a credential                                                     |
| POST   | `/api/sync/credentials/force-sync`                                          | Force immediate sync of all credentials to default device (admin only)               |

## Log Retrieval (admin / tech support)

| Method | Path                           | Description                                                                                                                   |
| ------ | ------------------------------ | ----------------------------------------------------------------------------------------------------------------------------- |
| GET    | `/api/logs/retrieve?deviceId=` | Retrieve buffered logs from TUYA devices. Optional `deviceId` for single device                                               |
| GET    | `/api/logs/gaps?deviceId=`     | Identify missing log periods (gaps). Optional `deviceId` filter                                                               |
| GET    | `/api/logs/access`             | Get access logs (existing); response includes `offline_flag`, `retrieval_status`, `sync_timestamp`, `event_hash` when present |

## Device Status (admin / tech support)

| Method | Path                      | Description                                                                              |
| ------ | ------------------------- | ---------------------------------------------------------------------------------------- |
| GET    | `/api/devices/status`     | Get all device sync status (connectivity, last sync, last log retrieval, pending counts) |
| GET    | `/api/devices/:id/status` | Get single device sync status                                                            |
| POST   | `/api/devices/:id/ping`   | Check device connectivity (ping TUYA API)                                                |

## Sync Queue & History (admin / tech support)

| Method | Path                             | Description                                   |
| ------ | -------------------------------- | --------------------------------------------- |
| GET    | `/api/sync/queue?status=pending` | Get pending (or other status) sync operations |
| POST   | `/api/sync/retry/:id`            | Retry a failed sync queue item by id          |
| GET    | `/api/sync/history?limit=50`     | Get sync audit history                        |

## Access Log Fields (sync-related)

- `event_hash` – SHA256 for deduplication (timestamp + device + user + result)
- `offline_flag` – Event occurred while device was offline
- `sync_timestamp` – When log was retrieved from device
- `retrieval_status` – `realtime` \| `buffered` \| `reconciled`
- `external_event_id` – Device/TUYA event ID

## Running the migration

```bash
cd backend
node scripts/run-sync-retention-migration.js
```

This creates: `credential_sync_status`, `access_schedule_sync`, `device_sync_status`, `sync_queue`, `log_retrieval_gaps`, `sync_audit_log`, and adds columns to `access_logs`.
