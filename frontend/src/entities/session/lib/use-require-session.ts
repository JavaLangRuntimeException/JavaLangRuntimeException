import { useEffect } from "react";
import { useNavigate } from "react-router";
import { useSession } from "../api/use-session";

/** 管理画面: セッションがなければログイン画面へ（旧 middleware / useSession のリダイレクトと同じ） */
export function useRequireSession() {
  const session = useSession();
  const navigate = useNavigate();
  useEffect(() => {
    if (!session.isLoading && !session.user) navigate("/admin/login", { replace: true });
  }, [session.isLoading, session.user, navigate]);
  return session;
}
