#!/bin/bash
echo "Aguardando o MongoDB iniciar..."
sleep 20 

# 1. Configura o Replica Set
docker exec mongo1 mongosh --eval "
  rs.initiate({
    _id: 'rs0',
    members: [
      { _id: 0, host: 'mongo1:27017' },
      { _id: 1, host: 'mongo2:27017' },
      { _id: 2, host: 'mongo3:27017' }
    ]
  })"
echo "Replica Set 'rs0' configurado."

# 2. Cria o bucket no MinIO com MC (CORRIGIDO)
echo "Criando bucket mongodb-backups no MinIO..."
docker exec minio sh -c "
  /usr/bin/mc alias set minio_local http://minio:9000 minioadmin minioadmin
  /usr/bin/mc mb minio_local/mongodb-backups --ignore-existing
"
echo "Bucket mongodb-backups criado no MinIO (ou ignorado se já existia)."

# 3. Verifica o status
docker exec mongo1 mongosh --eval "rs.status()"