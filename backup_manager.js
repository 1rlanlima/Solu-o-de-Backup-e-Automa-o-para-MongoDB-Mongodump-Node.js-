// backup_manager.js
const { exec } = require('child_process');
const fs = require('fs');
const path = require('path');
const AWS = require('aws-sdk');

// --- Configuração ---
const BUCKET_NAME = 'mongodb-backups';
const RETENTION_DAYS = 7;
const BACKUP_SCHEDULE_MS = 60000; // 1 minuto para demonstração

// Configuração do MinIO (S3)
const s3 = new AWS.S3({
    accessKeyId: 'minioadmin',
    secretAccessKey: 'minioadmin',
    endpoint: 'http://localhost:9000',
    s3ForcePathStyle: true,
    signatureVersion: 'v4',
    region: 'us-east-1'
});

// Função principal: Executa o dump, compacta e faz o upload
function runBackup() {
    const TIMESTAMP = new Date().toISOString().replace(/[:.]/g, '-');
    const BACKUP_NAME = `backup_${TIMESTAMP.substring(0, 19)}`;
    const ARCHIVE_FILE = `${BACKUP_NAME}.tgz`;
    const MONGO_URI = "mongodb://mongo1:27017/?replicaSet=rs0";
    const DUMP_DIR = `/tmp/${BACKUP_NAME}`; // Caminho interno do container

    console.log(`\n[${new Date().toISOString()}] Iniciando dump (Node.js direto)...`);

    // Comando 1: Realiza o mongodump dentro do container mongo1
    const DUMP_CMD = `docker exec mongo1 mongodump --uri "${MONGO_URI}" --out "${DUMP_DIR}" --oplog`;

    exec(DUMP_CMD, (dumpError, dumpStdout, dumpStderr) => {
        // CORREÇÃO: Verifica se o dump foi concluído, ignorando o erro de saída falso do mongodump
        const dumpSuccessful = dumpStdout.includes('dumped 1 oplog entry') || dumpStderr.includes('dumped 1 oplog entry');
        
        if (dumpError && !dumpSuccessful) {
            console.error(`Falha fatal no mongodump: ${dumpError.message}`);
            return;
        }

        // Comando 2: Compacta o dump DENTRO do container e limpa
        const COMPRESS_CMD = `docker exec mongo1 sh -c "cd /tmp && tar -czf ${ARCHIVE_FILE} ${BACKUP_NAME} && rm -rf ${DUMP_DIR}"`;

        exec(COMPRESS_CMD, (compError, compStdout, compStderr) => {
            if (compError || compStderr) {
                console.error(`Falha na Compactação/Limpeza (tar): ${compError?.message || compStderr}`);
                return;
            }

            // Comando 3: Copia o ARQUIVO COMPACTADO do container para o host
            const COPY_CMD = `docker cp mongo1:/tmp/${ARCHIVE_FILE} ./${ARCHIVE_FILE}`;

            exec(COPY_CMD, (copyError, copyStdout, copyStderr) => {
                if (copyError || copyStderr) {
                    console.error(`Falha na Cópia para o Host: ${copyError?.message || copyStderr}`);
                    return;
                }

                // 4. Faz o upload para o MinIO (S3)
                const FILE_PATH = path.join(process.cwd(), ARCHIVE_FILE);

                fs.readFile(FILE_PATH, (err, data) => {
                    if (err) { console.error(`Erro ao ler arquivo local:`, err); return; }

                    s3.upload({ Bucket: BUCKET_NAME, Key: `full-backups/${ARCHIVE_FILE}`, Body: data }, (err, data) => {
                        if (err) { console.error("Erro no Upload para MinIO:", err); } 
                        else {
                            console.log(`[SUCESSO] Backup ${ARCHIVE_FILE} enviado para MinIO.`);
                            
                            // 5. Limpeza Final
                            exec(`docker exec mongo1 rm -rf /tmp/${ARCHIVE_FILE}`, () => {});
                            fs.unlink(FILE_PATH, (unlinkErr) => {
                                if (unlinkErr) console.error(`Erro ao remover arquivo local:`, unlinkErr);
                            });
                            applyRetentionPolicy();
                        }
                    });
                });
            });
        });
    });
}

// Função de Retenção (Completa)
function applyRetentionPolicy() {
    console.log(`[${new Date().toISOString()}] Aplicando política de retenção (>${RETENTION_DAYS} dias)...`);

    s3.listObjects({ Bucket: BUCKET_NAME, Prefix: 'full-backups/' }, (err, data) => {
        if (err) {
            console.error('Erro ao listar objetos:', err);
            return;
        }

        const retentionDate = new Date();
        retentionDate.setDate(retentionDate.getDate() - RETENTION_DAYS);

        const objectsToDelete = data.Contents
            .filter(item => item.Key.endsWith('.tgz'))
            .filter(item => item.LastModified < retentionDate)
            .map(item => ({ Key: item.Key }));

        if (objectsToDelete.length === 0) {
            console.log('Nenhum backup antigo encontrado para exclusão.');
            return;
        }

        s3.deleteObjects({
            Bucket: BUCKET_NAME,
            Delete: { Objects: objectsToDelete }
        }, (err, data) => {
            if (err) {
                console.error('Erro ao excluir objetos:', err);
            } else {
                console.log(`Excluídos ${objectsToDelete.length} backups antigos com sucesso.`);
            }
        });
    });
}

// Inicializa a automação
runBackup();
setInterval(runBackup, BACKUP_SCHEDULE_MS);
console.log(`Gerenciador de backup rodando.`);