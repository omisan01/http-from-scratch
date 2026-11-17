const routes = []

const registerRoute = (method, path, handler) => {
    routes.push({
        method, path, handler
    })
}

const findRoute = (method, pathname) => {
    console.log(routes)
    for (let route of routes) {
        if (route.method !== method) continue;
        const params = matchRoute(route.path, pathname);
        if (params !== null) {
            return {
                ...route,
                params
            }
        }
    }
    return undefined
}

const findRouteByPathname = (pathname) => {
    return routes.filter((route) => matchRoute(route.path, pathname))
}

const matchRoute = (routePath, requestPath) => {
    const registeredPath = routePath.split("/");
    const incomingPath = requestPath.split("/")
    const params = {}

    if (registeredPath.length !== incomingPath.length) return null;

    for (let i = 0; i < registeredPath.length; i++) {
        if (registeredPath[i].startsWith(":")) {
            if (incomingPath[i] === "") return null
            const key = registeredPath[i].slice(1);
            params[key] = incomingPath[i]
            continue
        }
        if (registeredPath[i] !== incomingPath[i]) {
            return null
        }
    }

    return params
}

module.exports = { registerRoute, findRoute, findRouteByPathname, matchRoute }