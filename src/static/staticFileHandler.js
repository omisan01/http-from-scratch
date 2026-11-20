const fs = require("fs/promises")
const path = require("path");


const publicDir = path.resolve(__dirname, "../../public");
const TEXT = "; charset=utf-8";

const mimeTypeMap = {
    ".html": "text/html" + TEXT,
    ".css": "text/css" + TEXT,
    ".js": "text/javascript" + TEXT,
    ".json": "application/json" + TEXT,
    ".txt": "text/plain" + TEXT,
    ".svg": "image/svg+xml",
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".gif": "image/gif",
    ".webp": "image/webp",
    ".ico": "image/x-icon",
    ".woff2": "font/woff2"
};


const fail = (code, message) => {
    const error = new Error(message);
    error.code = code;
    return error;
};

const getStaticFile = async (requestedPath) => {
    try {
        const decodedPath = decodeURIComponent(requestedPath)
        if (decodedPath.includes("\0")) throw fail("BAD_PATH", "Null byte in path");

        let filePath = path.resolve(publicDir, decodedPath);
        const relativePath = path.relative(publicDir, filePath);
        if (
            relativePath === ".." ||
            relativePath.startsWith(`..${path.sep}`) ||
            path.isAbsolute(relativePath)
        ) {
            throw fail("INVALID_PATH", "Invalid file path");
        }

        const stat = await fs.stat(filePath);
        if (stat.isDirectory()) filePath = path.join(filePath, "index.html");

        const mimeType = mimeTypeMap[path.extname(filePath)] || "application/octet-stream";

        const contents = await fs.readFile(filePath)
        return { data: contents, mimeType, bytes: contents.length }
    } catch (e) {
        if (e instanceof URIError) e.code = "BAD_PATH";
        return { error: e };
    }
}

module.exports = { getStaticFile }

