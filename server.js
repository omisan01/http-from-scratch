const net = require("net")

const server = net.createServer((socket) => {
    let incomingBodyChunks = Buffer.alloc(0);
    let bodyBytes = 0;
    let headersParsed = false;


    socket.on("data", (data) => {
        const requestArr = data.toString().split('\r\n')

        // Request Line with method, target and version
        const requestLine = requestArr[0]
        const [method, target, version] = requestLine.split(" ")
        const queryStart = target.indexOf("?")
        let query = "";
        let pathname = "";
        if (queryStart === -1) {
            pathname = target
        } else {
            pathname = target.slice(0, queryStart)
            query = target.slice(queryStart + 1)
        }

        // Headers Array
        const headersArray = requestArr.slice(1, requestArr.indexOf(""))

        const finalHeaders = {}
        for (let header of headersArray) {
            const firstColon = header.indexOf(':')
            finalHeaders[header.slice(0, firstColon).toLowerCase()] = header.slice(firstColon + 1).trim()
        }

        // Body Parsing
        const bodyStart = data.indexOf("\r\n\r\n");
        const body = bodyStart !== -1 ? data.subarray(bodyStart + 4) : Buffer.alloc(0);





        console.log(body)

    })

})

server.listen(3000, "localhost", () => {
    console.log("server listenign to port 3000")
})