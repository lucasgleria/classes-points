function setupMenu() {
  const sideNav = document.getElementById("side-nav");
  const backdrop = document.querySelector(".backdrop");
  if (!sideNav || !backdrop) {
    return;
  }

  document.querySelectorAll("[data-open-menu]").forEach((button) => {
    button.addEventListener("click", () => {
      sideNav.classList.add("is-open");
      backdrop.classList.add("is-open");
    });
  });

  document.querySelectorAll("[data-close-menu]").forEach((button) => {
    button.addEventListener("click", () => {
      sideNav.classList.remove("is-open");
      backdrop.classList.remove("is-open");
    });
  });
}

function renderHistoryItems(history) {
  if (!history.length) {
    return `<div class="empty-state">Histórico vazio.</div>`;
  }

  return history
    .map((item) => {
      const date = new Date(item.created_at).toLocaleString("pt-BR");
      const isNegative = Number(item.points) < 0;
      const pointsClass = isNegative ? "history-points history-points--negative" : "history-points history-points--positive";
      const formattedPoints = isNegative ? `${item.points} pts` : `+${item.points} pts`;
      const note = item.note
        ? `<div class="history-note"><span class="history-note__label">Justificativa</span><strong>${item.note}</strong></div>`
        : "";

      return `
        <article class="history-row">
          <div class="history-row__top">
            <strong>${item.category}</strong>
            <span class="${pointsClass}">${formattedPoints}</span>
          </div>
          <span class="history-date">${date}</span>
          ${note}
        </article>`;
    })
    .join("");
}

async function loadStudentHistory(studentId, container, footer, footerLink) {
  container.innerHTML = `<div class="empty-state">Carregando...</div>`;
  if (footer) {
    footer.setAttribute("hidden", "");
  }

  const response = await fetch(`/api/students/${studentId}/history`);
  if (!response.ok) {
    container.innerHTML = `<div class="empty-state">Não foi possível carregar o histórico.</div>`;
    return;
  }

  const history = await response.json();
  const recentHistory = history.slice(0, 3);
  container.innerHTML = renderHistoryItems(recentHistory);

  if (history.length > 3 && footer && footerLink) {
    footerLink.href = `/students/${studentId}/history`;
    footer.removeAttribute("hidden");
  }
}

function setupDashboardHistory() {
  const buttons = document.querySelectorAll("[data-history-toggle]");
  const modal = document.getElementById("history-modal");
  const modalBackdrop = document.getElementById("history-modal-backdrop");
  const modalTitle = document.getElementById("history-modal-title");
  const modalContent = document.getElementById("history-modal-content");
  const closeButton = document.getElementById("history-modal-close");
  const modalFooter = document.getElementById("history-modal-footer");
  const modalLink = document.getElementById("history-modal-link");

  if (
    !buttons.length ||
    !modal ||
    !modalBackdrop ||
    !modalTitle ||
    !modalContent ||
    !closeButton ||
    !modalFooter ||
    !modalLink
  ) {
    return;
  }

  const closeModal = () => {
    modal.setAttribute("hidden", "");
    modalBackdrop.setAttribute("hidden", "");
    modalContent.innerHTML = "";
    modalFooter.setAttribute("hidden", "");
    modalLink.href = "#";
  };

  closeButton.addEventListener("click", closeModal);
  modalBackdrop.addEventListener("click", closeModal);

  buttons.forEach((button) => {
    button.addEventListener("click", async () => {
      const studentId = button.dataset.studentId;
      const studentName = button.dataset.studentName || "Aluno";

      modalTitle.textContent = studentName;
      modal.removeAttribute("hidden");
      modalBackdrop.removeAttribute("hidden");

      await loadStudentHistory(studentId, modalContent, modalFooter, modalLink);
    });
  });
}

function setupPointsForm() {
  const form = document.querySelector("[data-points-form]");
  if (!form) {
    return;
  }

  const categoryInput = form.querySelector("[name='category']");
  const pointsInput = form.querySelector("[name='points']");
  const noteInput = form.querySelector("[name='note']");
  const studentCheckboxes = Array.from(form.querySelectorAll("[data-student-checkbox]"));
  const selectAllButton = form.querySelector("[data-select-all]");
  const selectGroupButtons = form.querySelectorAll("[data-select-group]");

  const syncForm = () => {
    const category = categoryInput.value;
    if (category === "presence") {
      pointsInput.value = "1";
      pointsInput.readOnly = true;
    } else if (category === "homework") {
      if (pointsInput.value !== "1" && pointsInput.value !== "2") {
        pointsInput.value = "1";
      }
      pointsInput.readOnly = false;
      pointsInput.min = "1";
      pointsInput.max = "2";
    } else {
      pointsInput.readOnly = false;
      pointsInput.min = "1";
      pointsInput.max = "100";
      if (Number(pointsInput.value) < 1) {
        pointsInput.value = "1";
      }
    }

    noteInput.required = category === "bad_behavior";
  };

  categoryInput.addEventListener("change", syncForm);
  syncForm();

  if (selectAllButton && studentCheckboxes.length) {
    selectAllButton.addEventListener("click", () => {
      const shouldCheck = studentCheckboxes.some((checkbox) => !checkbox.checked);
      studentCheckboxes.forEach((checkbox) => {
        checkbox.checked = shouldCheck;
      });
      selectAllButton.textContent = shouldCheck ? "Desmarcar todos" : "Marcar todos";
    });
  }

  selectGroupButtons.forEach((button) => {
    button.addEventListener("click", () => {
      const group = button.dataset.selectGroup;
      const groupCheckboxes = studentCheckboxes.filter((checkbox) => checkbox.dataset.group === group);
      const shouldCheck = groupCheckboxes.some((checkbox) => !checkbox.checked);
      groupCheckboxes.forEach((checkbox) => {
        checkbox.checked = shouldCheck;
      });
      button.textContent = shouldCheck ? "Desmarcar turma" : "Marcar turma";
    });
  });

  const summaryModal = document.getElementById("points-summary-modal");
  const summaryBackdrop = document.getElementById("points-summary-backdrop");
  const summaryText = document.getElementById("points-summary-text");
  const summaryConfirm = document.getElementById("points-summary-confirm");
  const summaryCancel = document.getElementById("points-summary-cancel");
  const summaryClose = document.getElementById("points-summary-close");
  const categoryLabels = {
    homework: "Homework",
    games: "Games",
    challenges: "Challenges",
    presence: "Presence",
    bad_behavior: "Bad Behavior",
  };

  const closeSummary = () => {
    if (summaryModal && summaryBackdrop) {
      summaryModal.setAttribute("hidden", "");
      summaryBackdrop.setAttribute("hidden", "");
    }
  };

  [summaryCancel, summaryClose, summaryBackdrop].forEach((element) => {
    if (element) {
      element.addEventListener("click", closeSummary);
    }
  });

  if (summaryConfirm) {
    summaryConfirm.addEventListener("click", () => {
      form.dataset.confirmed = "true";
      closeSummary();
      form.submit();
    });
  }

  form.addEventListener("submit", (event) => {
    if (form.dataset.confirmed === "true") {
      return;
    }

    if (!studentCheckboxes.some((checkbox) => checkbox.checked)) {
      event.preventDefault();
      showInlineFormError(form, "Selecione pelo menos um aluno.");
      return;
    }

    if (summaryModal && summaryBackdrop && summaryText) {
      event.preventDefault();
      const selectedStudents = studentCheckboxes.filter((checkbox) => checkbox.checked);
      const category = categoryLabels[categoryInput.value] || categoryInput.value;
      const signedPoints = categoryInput.value === "bad_behavior" ? `-${pointsInput.value}` : `+${pointsInput.value}`;
      const classLabel = form.querySelector("[data-class-label]")?.dataset.classLabel || "turma selecionada";
      summaryText.textContent = `Voce vai lancar ${signedPoints} ${category} para ${selectedStudents.length} aluno(s) da ${classLabel}.`;
      summaryModal.removeAttribute("hidden");
      summaryBackdrop.removeAttribute("hidden");
    }
  });
}

function showInlineFormError(form, message) {
  let error = form.querySelector("[data-inline-error]");
  if (!error) {
    error = document.createElement("p");
    error.className = "error-banner";
    error.setAttribute("data-inline-error", "");
    form.prepend(error);
  }
  error.textContent = message;
}

function setupConfirmActions() {
  const modal = document.getElementById("confirm-modal");
  const backdrop = document.getElementById("confirm-modal-backdrop");
  const title = document.getElementById("confirm-modal-title");
  const message = document.getElementById("confirm-modal-message");
  const closeButton = document.getElementById("confirm-modal-close");
  const cancelButton = document.getElementById("confirm-modal-cancel");
  const confirmButton = document.getElementById("confirm-modal-confirm");
  let pendingForm = null;

  if (!modal || !backdrop || !title || !message || !confirmButton) {
    return;
  }

  const closeModal = () => {
    pendingForm = null;
    modal.setAttribute("hidden", "");
    backdrop.setAttribute("hidden", "");
  };

  [closeButton, cancelButton, backdrop].forEach((element) => {
    if (element) {
      element.addEventListener("click", closeModal);
    }
  });

  confirmButton.addEventListener("click", () => {
    if (pendingForm) {
      pendingForm.dataset.confirmed = "true";
      pendingForm.submit();
    }
    closeModal();
  });

  document.querySelectorAll("[data-confirm-action]").forEach((form) => {
    form.addEventListener("submit", (event) => {
      if (form.dataset.confirmed === "true") {
        return;
      }

      event.preventDefault();
      pendingForm = form;
      title.textContent = form.dataset.confirmTitle || "Confirmar acao";
      message.textContent = form.dataset.confirmMessage || "Deseja continuar?";
      modal.removeAttribute("hidden");
      backdrop.removeAttribute("hidden");
    });
  });
}

setupMenu();
setupDashboardHistory();
setupPointsForm();
setupConfirmActions();
