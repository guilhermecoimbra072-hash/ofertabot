import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { Auth } from "@/ofertabot/Auth";

const auth = vi.hoisted(() => ({
  signUp: vi.fn().mockResolvedValue({ data: { session: null }, error: null }),
  updateUser: vi.fn().mockResolvedValue({ error: null }),
  signInWithPassword: vi.fn().mockResolvedValue({ error: null }),
}));
vi.mock("@/ofertabot/api", () => ({ db: { auth }, configured: true, errorMessage: () => "Erro" }));
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("Mínimo de senha do OfertaBot", () => {
  it.each(["signup", "update"] as const)(
    "%s rejeita 5 e aceita 6 e mais caracteres",
    async (mode) => {
      render(<Auth recovery={mode === "update"} />);
      if (mode === "signup") {
        fireEvent.click(screen.getByRole("button", { name: "Criar minha conta" }));
        fireEvent.change(screen.getByLabelText("E-mail"), {
          target: { value: "isolado@example.invalid" },
        });
      }
      const action = mode === "signup" ? auth.signUp : auth.updateUser;
      const submit = screen.getByRole("button", {
        name: mode === "signup" ? "Criar conta" : "Salvar nova senha",
      });
      fireEvent.change(screen.getByLabelText("Senha"), { target: { value: "abcde" } });
      fireEvent.click(submit);
      await waitFor(() =>
        expect(screen.getByLabelText("Senha")).toHaveAttribute("aria-invalid", "true"),
      );
      expect(action).not.toHaveBeenCalled();
      for (const password of ["abcdef", "abcdefghijk"]) {
        fireEvent.change(screen.getByLabelText("Senha"), { target: { value: password } });
        fireEvent.click(submit);
        await waitFor(() =>
          expect(action).toHaveBeenCalledWith(expect.objectContaining({ password })),
        );
      }
    },
  );
  it("login preserva mínimo 1", async () => {
    render(<Auth />);
    fireEvent.change(screen.getByLabelText("E-mail"), {
      target: { value: "isolado@example.invalid" },
    });
    fireEvent.change(screen.getByLabelText("Senha"), { target: { value: "a" } });
    fireEvent.click(screen.getByRole("button", { name: "Entrar" }));
    await waitFor(() =>
      expect(auth.signInWithPassword).toHaveBeenCalledWith({
        email: "isolado@example.invalid",
        password: "a",
      }),
    );
  });
});
