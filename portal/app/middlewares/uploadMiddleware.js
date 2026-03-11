const multer = require('multer');
const fs = require('fs');
const path = require('path');

// DISK storage (padrão, usado por endpoints antigos tipo CSV)
const pastaUploads = path.join(__dirname, '..', 'uploads');
if (!fs.existsSync(pastaUploads)) {
  fs.mkdirSync(pastaUploads, { recursive: true });
}

const storageDisk = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, pastaUploads),
  filename: (_req, file, cb) => cb(null, `${Date.now()}-${file.originalname}`)
});

const upload = multer({
  storage: storageDisk,
  limits: { fileSize: 25 * 1024 * 1024 }
});

// MEMORY storage (para NF/contratos/comissões)
upload.memory = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 15 * 1024 * 1024 }
});

module.exports = upload;
