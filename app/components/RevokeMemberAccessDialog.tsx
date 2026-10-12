"use client";
import { useState } from "react";
import { LockKeyhole } from "lucide-react";
import { invitationApi } from "@/src/api/invitationApi";
import { productStore } from "@/lib/product-store";
import Dialog from "./Dialog";
import { Button } from "./ui";
import { useAsyncScope } from "./useAsyncScope";
export default function RevokeMemberAccessDialog({
  memberId,
  name,
  onClose,
  onDone,
}: {
  memberId: string;
  name: string;
  onClose: () => void;
  onDone: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const captureScope = useAsyncScope();
  const [error, setError] = useState("");
  return (
    <Dialog
      title={`停止 ${name} 的账号访问`}
      busy={busy}
      onClose={() => {
        if (!busy) onClose();
      }}
    >
      <div className="invite-intro">
        <LockKeyhole size={20} />
        <p>
          确认后，这位家人将无法使用原账号登录。已经打开的页面会在下次更新记录时退出。
        </p>
      </div>
      <div className="account-revoke-facts">
        <p>成员资料、联系方式、已有任务和处理记录会保留。</p>
        <p>
          需要重新加入时，可以为这份成员资料生成新邀请。新邀请可使用原邮箱。
        </p>
      </div>
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
      <div className="dialog-actions">
        <Button variant="secondary" disabled={busy} onClick={onClose}>
          暂不停止
        </Button>
        <Button
          variant="danger"
          disabled={busy}
          onClick={async () => {
            if (busy) return;
            const stillCurrent = captureScope();
            setBusy(true);
            setError("");
            try {
              await invitationApi.revokeAccount(memberId);
              if (!stillCurrent()) return;
              await productStore.refreshRecords();
              if (!stillCurrent()) return;
              onDone();
            } catch (cause) {
              if (!stillCurrent()) return;
              setError(
                cause instanceof Error
                  ? cause.message
                  : "账号访问未停止，请重试",
              );
            } finally {
              if (stillCurrent()) setBusy(false);
            }
          }}
        >
          {busy ? "正在停止…" : "确认停止访问"}
        </Button>
      </div>
    </Dialog>
  );
}
