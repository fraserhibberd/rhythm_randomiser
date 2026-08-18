(() => {
  "use strict";

  async function loadApplicationShell() {
    const response = await fetch("../frontend/index.html");
    if (!response.ok) {
      throw new Error(`Could not load the application (${response.status}).`);
    }

    const html = await response.text();
    const htmlWithSharedAssetBase = html.replace(
      "<head>",
      '<head><base href="../frontend/">'
    );
    document.open();
    document.write(htmlWithSharedAssetBase);
    document.close();
  }

  loadApplicationShell().catch((error) => {
    document.body.textContent = error.message;
  });
})();
