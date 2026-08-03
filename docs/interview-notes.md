# Interview Notes

## Chunk Size

Chunks are fixed at 4 MB. Smaller chunks improve parallelism and reduce retry cost, but increase metadata rows and request overhead. Larger chunks reduce metadata overhead, but make retries and repair more expensive.

## Replication Factor

RF=3 is the standard simple replication baseline. It survives one failure cleanly and can tolerate two simultaneous failures before data loss if all replicas were successfully written.

## Write Quorum

The CLI commits a chunk after 2 of 3 storage nodes confirm durable storage. That means a committed chunk can survive one immediate node failure. The tradeoff is higher write latency than primary-only acknowledgement.

## Failure Detection

Metadata polls every 5 seconds and marks a node dead after 3 misses. This bounds detection around 15 seconds while avoiding false positives from one transient missed heartbeat.

## Repair

Repair is metadata-orchestrated and storage-node-pulled. Metadata picks a healthy source and spare healthy target; the target fetches the chunk and validates the checksum before metadata records the new location.

## Metadata SPOF

The metadata service is a single point of failure in the MVP. That is explicit scope control, not an oversight. Making metadata highly available would require leader election or consensus and would distract from the core file-store demo.

## GFS/HDFS Comparison

Similarities:

- central metadata service
- chunked files
- direct client-to-storage data path
- replication and repair

Differences:

- REST instead of custom RPC
- Postgres instead of an in-memory namespace log/checkpoint design
- no rack awareness
- no metadata HA
- no rebalancing or append semantics
