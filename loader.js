// loader.js
(function(){
  function load(file) {
    var s = document.createElement("script");
    s.src = file;
    document.body.appendChild(s);
  }
  const base = "https://cdn.jsdelivr.net/gh/pendekarsaga/Javascript@main/";
  load(base + "utils.js");
  load(base + "ui.js");
  load(base + "db-worker.js");
  load(base + "api.js");
  load(base + "actions.js");
})();