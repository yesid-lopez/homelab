# Langfuse ClickHouse Cleanup Instructions

## Overview
Regular cleanup of Langfuse traces and ClickHouse system logs to free disk space.

## Current Setup
- **ClickHouse Pod**: `langfuse-clickhouse-shard0-0`
- **Namespace**: `langfuse`
- **PVC**: `data-langfuse-clickhouse-shard0-0` (70Gi)

## What Gets Cleaned
1. **Langfuse Data**: traces, observations, scores tables
2. **ClickHouse System Logs**: trace_log, text_log (these grow massive over time)

## Cleanup Commands

### 1. Connect and Check Current Usage
```bash
# Check current disk usage
kubectl exec -n langfuse langfuse-clickhouse-shard0-0 -- df -h /var/lib/clickhouse

# Get ClickHouse password
CLICKHOUSE_PASSWORD=$(kubectl get secret langfuse-clickhouse -n langfuse -o jsonpath='{.data.admin-password}' | base64 -d)

# Check table sizes
kubectl exec -n langfuse langfuse-clickhouse-shard0-0 -- clickhouse-client --user default --password "$CLICKHOUSE_PASSWORD" --query "SELECT table, formatReadableSize(sum(bytes_on_disk)) as size FROM system.parts WHERE active GROUP BY table ORDER BY sum(bytes_on_disk) DESC"
```

### 2. Clean Langfuse Application Data
```bash
# Truncate application tables
kubectl exec -n langfuse langfuse-clickhouse-shard0-0 -- clickhouse-client --user default --password "$CLICKHOUSE_PASSWORD" --query "TRUNCATE TABLE observations"
kubectl exec -n langfuse langfuse-clickhouse-shard0-0 -- clickhouse-client --user default --password "$CLICKHOUSE_PASSWORD" --query "TRUNCATE TABLE traces"
kubectl exec -n langfuse langfuse-clickhouse-shard0-0 -- clickhouse-client --user default --password "$CLICKHOUSE_PASSWORD" --query "TRUNCATE TABLE scores"
```

### 3. Clean ClickHouse System Logs (Major Space Saver)
```bash
# Clean system logs (these grow very large)
kubectl exec -n langfuse langfuse-clickhouse-shard0-0 -- clickhouse-client --user default --password "$CLICKHOUSE_PASSWORD" --query "TRUNCATE TABLE system.trace_log"
kubectl exec -n langfuse langfuse-clickhouse-shard0-0 -- clickhouse-client --user default --password "$CLICKHOUSE_PASSWORD" --query "TRUNCATE TABLE system.text_log"
kubectl exec -n langfuse langfuse-clickhouse-shard0-0 -- clickhouse-client --user default --password "$CLICKHOUSE_PASSWORD" --query "TRUNCATE TABLE system.metric_log"
```

### 4. Optimize Tables to Reclaim Space
```bash
# Optimize tables to reclaim disk space
kubectl exec -n langfuse langfuse-clickhouse-shard0-0 -- clickhouse-client --user default --password "$CLICKHOUSE_PASSWORD" --query "OPTIMIZE TABLE traces FINAL"
kubectl exec -n langfuse langfuse-clickhouse-shard0-0 -- clickhouse-client --user default --password "$CLICKHOUSE_PASSWORD" --query "OPTIMIZE TABLE observations FINAL"
kubectl exec -n langfuse langfuse-clickhouse-shard0-0 -- clickhouse-client --user default --password "$CLICKHOUSE_PASSWORD" --query "OPTIMIZE TABLE scores FINAL"
```

### 5. Verify Results
```bash
# Check final disk usage
kubectl exec -n langfuse langfuse-clickhouse-shard0-0 -- df -h /var/lib/clickhouse

# Verify tables are empty
kubectl exec -n langfuse langfuse-clickhouse-shard0-0 -- clickhouse-client --user default --password "$CLICKHOUSE_PASSWORD" --query "SELECT 'Traces:' as table, count(*) as count FROM traces UNION ALL SELECT 'Observations:', count(*) FROM observations UNION ALL SELECT 'Scores:', count(*) FROM scores"
```

## Expected Results
- **Before cleanup**: ~50GB used
- **After cleanup**: ~2-3GB used (mostly system overhead)
- **Space freed**: ~47GB

## Why So Much Space?
ClickHouse system logs (`trace_log`, `text_log`) accumulate every database operation over months:
- Every query execution trace
- Every server log message  
- Every metric collection
- Every internal optimization

These logs can grow to 30-40GB over a few months of operation.

## Frequency
Run this cleanup every 2-3 months or when disk usage exceeds 70%.

## Notes
- No backup needed - these are logs and can be regenerated
- PVC size stays 70Gi (doesn't shrink automatically)
- Actual disk usage will drop significantly
- ClickHouse will continue working normally after cleanup