// Each domain serves the same site from the static files in site/, under its own name.
// The www hosts redirect permanently to their bare domain, keeping the path and query.
export default {
  fetch(request, env) {
    const url = new URL(request.url);
    if (url.hostname.startsWith("www.")) {
      url.protocol = "https:"; url.hostname = url.hostname.slice(4); url.port = "";
      return Response.redirect(url.toString(), 301);
    }
    return env.ASSETS.fetch(request);
  },
};
