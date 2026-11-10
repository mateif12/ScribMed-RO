"use client";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";

export interface ConfirmRequest {
  title: string;
  description: string;
  confirmLabel: string;
  destructive?: boolean;
  onConfirm: () => void;
}

export function ConfirmDialog({ request, onClose }: { request: ConfirmRequest | null; onClose: () => void }) {
  return (
    <Dialog open={request !== null} onOpenChange={(open) => (!open ? onClose() : undefined)}>
      {request ? (
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{request.title}</DialogTitle>
            <DialogDescription>{request.description}</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={onClose}>
              Renunță
            </Button>
            <Button
              variant={request.destructive ? "destructive" : "default"}
              onClick={() => {
                request.onConfirm();
                onClose();
              }}
              data-testid="confirm-dialog-confirm"
            >
              {request.confirmLabel}
            </Button>
          </DialogFooter>
        </DialogContent>
      ) : null}
    </Dialog>
  );
}
