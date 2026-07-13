import { useToast as useToastFromContext } from "../contexts/ToastContext";

export function useToast() {
  return useToastFromContext();
}
