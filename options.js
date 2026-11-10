const mistralKeyInput = document.querySelector("#mistral-api-key");
const mistralStatus = document.querySelector("#mistral-status");
const saveMistralKeyButton = document.querySelector("#save-mistral-key");
const testMistralKeyButton = document.querySelector("#test-mistral-key");
const removeMistralKeyButton = document.querySelector("#remove-mistral-key");

async function loadSettings() {
  if (await MistralApi.hasApiKey()) {
    mistralStatus.textContent = "A Mistral API key is saved in Chrome storage.";
  }
}

saveMistralKeyButton.addEventListener("click", async () => {
  mistralStatus.textContent = "";
  try {
    await MistralApi.saveApiKey(mistralKeyInput.value);
    mistralKeyInput.value = "";
    mistralStatus.textContent = "Mistral API key saved. It will be reused automatically.";
  } catch (error) {
    mistralStatus.textContent = error.message;
  }
});

testMistralKeyButton.addEventListener("click", async () => {
  testMistralKeyButton.disabled = true;
  mistralStatus.textContent = "Testing the saved Mistral API key...";
  try {
    await MistralApi.testApiKey();
    mistralStatus.textContent = "Mistral API key works.";
  } catch (error) {
    mistralStatus.textContent = error.message;
  } finally {
    testMistralKeyButton.disabled = false;
  }
});

removeMistralKeyButton.addEventListener("click", async () => {
  try {
    await MistralApi.removeApiKey();
    mistralKeyInput.value = "";
    mistralStatus.textContent = "Mistral API key removed.";
  } catch (error) {
    mistralStatus.textContent = error.message;
  }
});

loadSettings().catch((error) => {
  mistralStatus.textContent = `Couldn't load settings: ${error.message}`;
});
