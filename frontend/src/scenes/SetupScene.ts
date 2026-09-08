/**
 * SetupScene - Draft ID entry form scene
 * 
 * Responsibilities:
 * - Render a DOM input for Sleeper draft ID
 * - Handle form submission
 * - Call api.createSession() with the draft ID
 * - Store session.id in localStorage
 * - Transition to PositionBoardScene on success
 * - Show error message on failure (404, 502)
 */

import Phaser from "phaser";
import * as api from "../services/api";

export class SetupScene extends Phaser.Scene {
  private domElement?: HTMLDivElement;
  private errorMessage?: HTMLDivElement;

  constructor() {
    super({ key: "SetupScene" });
  }

  create(): void {
    // Clear any previous session
    localStorage.removeItem("session_id");

    // Build the form HTML
    const formHTML = `
      <div style="
        background: white;
        padding: 40px;
        border-radius: 10px;
        box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
        min-width: 300px;
        text-align: center;
        font-family: Arial, sans-serif;
      ">
        <h1 style="margin: 0 0 20px 0; color: #333;">Fantasy Football Plinko</h1>
        <p style="margin: 0 0 20px 0; color: #666; font-size: 14px;">Enter your Sleeper Draft ID to continue</p>
        <input 
          type="text" 
          id="draft-id-input" 
          placeholder="Draft ID" 
          style="
            padding: 10px;
            width: 100%;
            margin-bottom: 15px;
            border: 1px solid #ccc;
            border-radius: 5px;
            font-size: 14px;
            box-sizing: border-box;
          "
        />
        <button 
          id="submit-btn" 
          style="
            padding: 10px 20px;
            background: #007bff;
            color: white;
            border: none;
            border-radius: 5px;
            cursor: pointer;
            font-size: 14px;
            width: 100%;
          "
        >
          Start Draft
        </button>
      </div>
    `;

    // Use Phaser's DOM element (note: we'll attach HTML via document manipulation)
    const formElement = document.createElement("div");
    formElement.innerHTML = formHTML;
    formElement.style.position = "absolute";
    formElement.style.left = "50%";
    formElement.style.top = "50%";
    formElement.style.transform = "translate(-50%, -50%)";
    formElement.style.zIndex = "1000";
    document.body.appendChild(formElement);

    // Get references to input and button
    const input = formElement.querySelector("#draft-id-input") as HTMLInputElement;
    const submitBtn = formElement.querySelector("#submit-btn") as HTMLButtonElement;

    // Store reference for cleanup
    this.domElement = formElement as any;

    // Handle form submission
    const handleSubmit = async () => {
      const draftId = input.value.trim();

      if (!draftId) {
        this.showError("Please enter a Draft ID", formElement);
        return;
      }

      submitBtn.disabled = true;
      submitBtn.textContent = "Loading...";

      try {
        const session = await api.createSession(draftId);
        localStorage.setItem("session_id", String(session.id));
        formElement.remove();
        this.scene.start("PositionBoardScene", { sessionId: session.id });
      } catch (error) {
        submitBtn.disabled = false;
        submitBtn.textContent = "Start Draft";

        const errorMsg =
          error instanceof Error ? error.message : "Unknown error";

        if (errorMsg.includes("404")) {
          this.showError("Draft not found. Check your Draft ID.", formElement);
        } else if (errorMsg.includes("502")) {
          this.showError(
            "Sleeper API is unavailable. Please try again later.",
            formElement
          );
        } else {
          this.showError(errorMsg, formElement);
        }
      }
    };

    submitBtn.addEventListener("click", handleSubmit);
    input.addEventListener("keypress", (e) => {
      if (e.key === "Enter") handleSubmit();
    });

    // Focus on input
    input.focus();
  }

  private showError(message: string, formElement: HTMLElement): void {
    let errorDiv = formElement.querySelector(
      "#error-message"
    ) as HTMLDivElement;

    if (!errorDiv) {
      errorDiv = document.createElement("div");
      errorDiv.id = "error-message";
      errorDiv.style.marginTop = "15px";
      errorDiv.style.padding = "10px";
      errorDiv.style.background = "#f8d7da";
      errorDiv.style.color = "#721c24";
      errorDiv.style.borderRadius = "5px";
      errorDiv.style.fontSize = "14px";
      formElement.appendChild(errorDiv);
    }

    errorDiv.textContent = message;
    errorDiv.style.display = "block";
  }

  shutdown(): void {
    // Clean up DOM elements
    if (this.domElement && this.domElement.parentElement) {
      this.domElement.parentElement.removeChild(this.domElement);
    }
  }
}
