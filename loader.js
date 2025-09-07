// loader.js
(function(){
  function loadSequential(files, base) {
    if (!files.length) return;
    const f = files.shift();
    var s = document.createElement("script");
    s.src = base + f;
    s.onload = () => loadSequential(files, base); // lanjut setelah selesai
    document.body.appendChild(s);
  }

  const base = "https://cdn.jsdelivr.net/gh/pendekarsaga/Javascript@main/";
  const files = [
    "utils.js",
    "ui.js",
    "db-worker.js",
    "api.js",
    "actions.js"
  ];
  loadSequential([...files], base); // copy array biar aman
})();
