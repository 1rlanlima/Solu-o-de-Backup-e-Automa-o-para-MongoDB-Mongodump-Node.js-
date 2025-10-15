## Estrutura Final do README.md 

````markdown
# Solução de Backup e Automação para MongoDB (Mongodump + Node.js)

**STATUS:** Solução Funcional (Partes A, B, C e D - Simulação)

---

### 1. Objetivo da Atividade

* Implementar Backup, Automação e Recuperação para um cluster MongoDB (Replica Set).
* Foco em backups automáticos, armazenamento em S3/MinIO e política de retenção.
* A solução utiliza `mongodump` com a flag `--oplog` para simular a capacidade de Point-in-Time Recovery (PITR).

### 2. Arquitetura da Solução (Docker Compose)

| Serviço | Função | Imagem Base |
| :--- | :--- | :--- |
| `mongo1, mongo2, mongo3` | **Replica Set (rs0)**: Cluster de 3 nós. | `mongo:6.0` |
| `minio` | **Storage S3**: Simula o armazenamento em nuvem. | `minio/minio` |
| `pbm-client` | **Utilitário**: Container para execução de `mongorestore` e utilidades. | `mongo:6.0` |

### 3. Guia de Inicialização (Setup)

1.  **Instalar Dependências Node.js:**
    ```bash
    npm install aws-sdk
    ```

2.  **Subir o Ambiente:**
    ```bash
    docker compose up -d
    ```

3.  **Configurar o Replica Set e o MinIO:**
    *Este script configura o `rs0` e cria o bucket `mongodb-backups` no MinIO.*
    ```bash
    ./init-rs.sh
    ```

### 4. Execução do Sistema (Automação e Retenção)

* O script Node.js agendará o backup e a retenção a cada 60 segundos.

```bash
node backup_manager.js
````

### 5\. Prova de Funcionamento e Verificação (Cenários B e C)

  * **Lógica:** O `backup_manager.js` executa o `mongodump --oplog`, compacta o resultado (`.tgz`) e usa o `aws-sdk` para o upload seguro no MinIO.

  * **Prova de Sucesso (Log do Node.js):**

      * O critério de sucesso é a mensagem que indica o envio bem-sucedido:
        ```
        [SUCESSO] Backup [nome_do_arquivo].tgz enviado para MinIO.
        ```

  * **Comando de Verificação (MinIO/S3):**

      * Confirmação de que o arquivo existe no MinIO (usando a AWS CLI em um container):

    <!-- end list -->

    ```bash
    docker run --rm --network atividadeprticaemmongodb_mongo-net -e AWS_ACCESS_KEY_ID="minioadmin" -e AWS_SECRET_ACCESS_KEY="minioadmin" amazon/aws-cli s3 ls s3://mongodb-backups/full-backups/ --endpoint-url http://minio:9000 --no-verify-ssl
    ```

### 6\. Restauração e Cenários (Parte D)

  * *Assumindo que o backup está descompactado em `/tmp/restore_dump/dump` no container `pbm-client`.*

| Cenário | Descrição | Comando de Restauração |
| :--- | :--- | :--- |
| **Completa** (Cenário 4/5) | Restauração total do cluster a partir do último dump. | `docker exec pbm-client mongorestore --uri "mongodb://mongo1:27017/?replicaSet=rs0" --dir /tmp/restore_dump/dump` |
| **Seletiva** (Cenário 6) | Restaura apenas a coleção `usuarios`. | `docker exec pbm-client mongorestore --uri ... --dir /tmp/restore_dump/dump --nsInclude "atividade_db.usuarios"` |
| **Retenção** (Cenário 7) | Lógica de remoção de arquivos antigos implementada na função `applyRetentionPolicy` do Node.js. | (Lógica executada automaticamente a cada ciclo) |

### 7\. Notas Técnicas Finais

  * **PITR (Simulação):** O requisito de Point-in-Time Recovery foi endereçado pela inclusão da flag `--oplog` no `mongodump`.
  * **Problemas de Shell:** A complexidade na implementação do `backup.sh` e `backup_manager.js` foi necessária para contornar problemas de compatibilidade de `path` e sintaxe entre os shells (Git Bash, Docker e Node.js) em ambientes Windows, garantindo a execução do *pipeline* de backup.

<!-- end list -->

```
```
