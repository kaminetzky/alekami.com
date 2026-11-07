// Every address the site answers on redirects permanently to alekami.com, keeping the path and query.
// alekami.com itself is served from the static files in site/.
const HOME = "alekami.com";

export default {
  fetch(request, env) {
    const url = new URL(request.url);
    if (url.hostname !== HOME) {
      url.protocol = "https:"; url.hostname = HOME; url.port = "";
      return Response.redirect(url.toString(), 301);
    }
    return env.ASSETS.fetch(request);
  },
};
