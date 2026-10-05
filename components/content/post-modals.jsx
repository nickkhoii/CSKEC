'use client';

import { useActionState } from 'react';
import { FileText, Plus } from 'lucide-react';
import { Button } from '@/components/ui';
import { ActionButton } from '@/components/ui/action-button';
import { Modal, useDisclosure } from '@/components/ui/modal';
import { PostFormFields, PostFormShell } from '@/components/content/post-form-fields';
import {
  createPostAction,
  updatePostAction,
  setPostStatusAction,
} from '@/actions/content-actions';

/**
 * ---------------------------------------------------------------------------
 * Club update modals + row controls (Secretary module)
 * Wires createPostAction / updatePostAction / setPostStatusAction to the UI.
 * ---------------------------------------------------------------------------
 */

function CreatePostModal({ activities }) {
  const [state, formAction] = useActionState(createPostAction, null);
  const { isOpen, open, close } = useDisclosure();

  return (
    <>
      <Button onClick={open}>
        <Plus className="h-4 w-4" aria-hidden="true" />
        New club update
      </Button>
      <Modal
        open={isOpen}
        onClose={close}
        title="New club update"
        description="Drafts stay private until you publish them."
        size="lg"
      >
        <form action={formAction} className="space-y-5">
          <PostFormFields activities={activities} />
          <PostFormShell state={state} action={formAction} submitLabel="Save update" />
        </form>
      </Modal>
    </>
  );
}

function EditPostModal({ post, activities }) {
  const [state, formAction] = useActionState(updatePostAction, null);
  const { isOpen, open, close } = useDisclosure();

  return (
    <>
      <Button size="sm" variant="secondary" onClick={open}>
        <FileText className="h-3.5 w-3.5" aria-hidden="true" />
        Edit
      </Button>
      <Modal
        open={isOpen}
        onClose={close}
        title="Edit club update"
        description={post.title}
        size="lg"
      >
        <form action={formAction} className="space-y-5">
          <PostFormFields post={post} activities={activities} />
          <PostFormShell state={state} action={formAction} submitLabel="Save changes" />
        </form>
      </Modal>
    </>
  );
}

/** Quick publish / archive controls for one row. */
export function PostStatusControls({ post, canPublish }) {
  return (
    <div className="flex flex-wrap items-center justify-end gap-1.5">
      {post.status !== 'DRAFT' ? (
        <ActionButton
          action={setPostStatusAction}
          args={[post.id, 'DRAFT']}
          label="Unpublish"
          variant="ghost"
        />
      ) : null}
      {post.status !== 'PUBLISHED' ? (
        <ActionButton
          action={setPostStatusAction}
          args={[post.id, 'PUBLISHED']}
          label="Publish"
          variant="success"
          disabled={!canPublish}
          disabledReason="You need post:publish to publish"
        />
      ) : null}
      {post.status !== 'ARCHIVED' ? (
        <ActionButton
          action={setPostStatusAction}
          args={[post.id, 'ARCHIVED']}
          label="Archive"
          variant="secondary"
        />
      ) : null}
    </div>
  );
}

export { CreatePostModal, EditPostModal };