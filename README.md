# Validador OD

Aplicación web Colbeef para consultar OD facturadas (Cliente → Corte → OD → Lote) contra SIRT, con exportación a Excel y acceso por PIN.

## Requisitos

- Node.js 18+ (recomendado 20 LTS)
- Acceso de red a PostgreSQL SIRT (`10.64.1.47`)
- Archivo `.env` con credenciales (no se versiona)

## Arranque local

```bash
cp .env.example .env
# Editar .env con claves reales
npm install
npm start
```

- Local: http://localhost:3050  
- PIN por defecto: el de `ACCESS_PIN` en `.env`

## Despliegue en servidor 205 (`10.64.1.205`)

### 1. Clonar e instalar

```bash
cd /opt   # o la ruta que usen en el 205
git clone https://github.com/desarrollotecnologia/Validador_OD.git
cd Validador_OD
cp .env.example .env
nano .env   # completar POSTGRES_*, ACCESS_PIN, ACCESS_SECRET, PORT
npm install --omit=dev
```

### 2. Variables mínimas en `.env`

```env
POSTGRES_HOST=10.64.1.47
POSTGRES_PORT=5432
POSTGRES_DB=sirt
POSTGRES_USER=acceso
POSTGRES_PASSWORD=***
PORT=3050
ACCESS_PIN=0199
ACCESS_SECRET=un-secreto-largo-y-unico
```

### 3. Levantar con PM2 (recomendado)

```bash
npm install -g pm2
pm2 start ecosystem.config.cjs
pm2 save
pm2 startup
```

Comandos útiles:

```bash
pm2 status
pm2 logs validador-od
pm2 restart validador-od
```

### 4. Acceso

URL interna: **http://10.64.1.205:3050**

Abrir el puerto `3050/tcp` en el firewall del 205 si otras PCs de la red deben entrar.

### 5. Actualizar versión

```bash
cd /opt/Validador_OD   # ajustar ruta
git pull
npm install --omit=dev
pm2 restart validador-od
```

## Notas

- El servidor escucha en `0.0.0.0` (accesible por IP de red).
- Sin PIN válido la API `/api/od/*` responde `401`.
- `.env` nunca debe subirse a Git.
