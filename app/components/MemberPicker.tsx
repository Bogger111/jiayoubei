"use client";

import { Users, X } from "lucide-react";
import type { FamilyMember } from "@/lib/product-models";
import { Avatar } from "./ui";
import { useDialogFocusTrap } from "./useDialogFocus";

export function MemberPicker({
  title,
  members,
  busy,
  onChoose,
  onClose,
}: {
  title: string;
  members: FamilyMember[];
  busy?: boolean;
  onChoose: (id: string) => void;
  onClose: () => void;
}) {
  const close = () => {
    if (!busy) onClose();
  };
  const dialogRef = useDialogFocusTrap(close);
  return (
    <div className="dialog-backdrop" onClick={close}>
      <div
        ref={dialogRef}
        className="simple-dialog member-picker"
        role="dialog"
        aria-modal="true"
        aria-label={title}
        tabIndex={-1}
        onClick={(event) => event.stopPropagation()}
      >
        <button
          className="dialog-close"
          aria-label="关闭"
          disabled={busy}
          onClick={close}
        >
          <X size={18} />
        </button>
        <div className="dialog-warning">
          <Users size={22} />
        </div>
        <h2>{title}</h2>
        <p>选择一位家庭成员接手处理。</p>
        <div className="member-pick-list">
          {members.map((member) => (
            <button
              key={member.id}
              disabled={busy}
              onClick={() => onChoose(member.id)}
            >
              <Avatar member={member} />
              <span>
                <strong>{member.name}</strong>
                <small>
                  {member.role} · {member.location}
                </small>
              </span>
            </button>
          ))}
          {members.length === 0 && <p>当前没有其他家庭成员可以选择。</p>}
        </div>
      </div>
    </div>
  );
}
