const net = require("net");

const client = net.createConnection(
    { port: 3000, host: "localhost" },
    () => {
        client.write(`POST /users HTTP/1.1\r\nHost: localhost\r\nContent-Type: application/json\r\nContent-Length: 16\r\n\r\n{"name":`)
        client.write(`"Om`)

    }
);

client.on("data", (data) => {
    console.log(data.toString());
});

client.on("end", () => {
    console.log("Server closed the connection");
});