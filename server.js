const { createApp } = require("./app");

const port = Number.parseInt(process.env.PORT || "3100", 10);
const { app } = createApp();

app.listen(port, () => {
  console.log(`English Class Points rodando em http://localhost:${port}`);
});
