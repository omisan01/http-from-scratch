const fs = require("fs/promises")
const path = require("path");


const mimeTypeMap = {
    ".html": "text/html",
    ".css": "text/css",
    ".js": "text/javascript",
    ".json": "application/json",
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg"
}

const getStaticFile = async (requestedPath) => {
    try {
        const decodedPath = decodeURIComponent(requestedPath)
        const publicDir = path.resolve(__dirname, "../../public");
        const filePath = path.resolve(publicDir, decodedPath);
        const relativePath = path.relative(publicDir, filePath);
        if (
            relativePath === ".." ||
            relativePath.startsWith(`..${path.sep}`) ||
            path.isAbsolute(relativePath)
        ) {
            const error = new Error("Invalid file path");
            error.code = "INVALID_PATH";
            throw error;
        }
        const mimeType = mimeTypeMap[path.extname(filePath)] || "application/octet-stream";

        const contents = await fs.readFile(filePath)
        return { data: contents, mimeType, bytes: contents.length }
    } catch (e) {
        return { error: e };
    }
}

module.exports = { getStaticFile }

