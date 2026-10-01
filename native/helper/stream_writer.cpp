#include "stream_writer.h"
#ifdef _WIN32
namespace spike02 {
StreamWriter::StreamWriter() {
  InitializeCriticalSection(&lock_);
  wake_ = CreateEventW(nullptr, FALSE, FALSE, nullptr);
  if (wake_) thread_ = CreateThread(nullptr, 0, Run, this, 0, nullptr);
  if (!thread_) failed_ = true;
}
StreamWriter::~StreamWriter() {
  Finish();
  if (thread_) CloseHandle(thread_);
  if (wake_) CloseHandle(wake_);
  while (head_) { Node* n = head_; head_ = n->next; HeapFree(GetProcessHeap(), 0, n); }
  DeleteCriticalSection(&lock_);
}
bool StreamWriter::Enqueue(const std::string& frame) {
  if (frame.size() > 32768) return false;
  EnterCriticalSection(&lock_);
  const size_t size = frame.size() + 1;
  if (failed_ || closing_ || bytes_ + size > 256 * 1024) { LeaveCriticalSection(&lock_); return false; }
  Node* node = static_cast<Node*>(HeapAlloc(GetProcessHeap(), 0, sizeof(Node) + size));
  if (!node) { failed_ = true; LeaveCriticalSection(&lock_); return false; }
  node->next = nullptr; node->size = static_cast<DWORD>(size);
  CopyMemory(node->data, frame.data(), frame.size()); node->data[frame.size()] = '\n';
  if (tail_) tail_->next = node; else head_ = node;
  tail_ = node; bytes_ += size;
  LeaveCriticalSection(&lock_); SetEvent(wake_); return true;
}
bool StreamWriter::Failed() {
  EnterCriticalSection(&lock_); const bool failed = failed_; LeaveCriticalSection(&lock_); return failed;
}
DWORD WINAPI StreamWriter::Run(void* context) {
  StreamWriter* w = static_cast<StreamWriter*>(context);
  for (;;) {
    EnterCriticalSection(&w->lock_);
    Node* n = w->head_;
    const bool closed = w->closing_;
    if (n) { w->head_ = n->next; if (!w->head_) w->tail_ = nullptr; }
    LeaveCriticalSection(&w->lock_);
    if (!n) {
      if (closed) return 0;
      if (WaitForSingleObject(w->wake_, INFINITE) != WAIT_OBJECT_0) {
        EnterCriticalSection(&w->lock_); w->failed_ = true; LeaveCriticalSection(&w->lock_);
        return 1;
      }
      continue;
    }
    DWORD written = 0; DWORD total = 0; bool ok = true;
    while (total < n->size) {
      if (!WriteFile(GetStdHandle(STD_OUTPUT_HANDLE), n->data + total, n->size - total, &written, nullptr) || written == 0) { ok = false; break; }
      total += written;
    }
    EnterCriticalSection(&w->lock_); w->bytes_ -= n->size; if (!ok) w->failed_ = true; LeaveCriticalSection(&w->lock_);
    HeapFree(GetProcessHeap(), 0, n);
    if (!ok) return 1;
  }
}
bool StreamWriter::Finish() {
  if (!thread_) return false;
  EnterCriticalSection(&lock_); closing_ = true; LeaveCriticalSection(&lock_); SetEvent(wake_);
  if (WaitForSingleObject(thread_, 5000) != WAIT_OBJECT_0) {
    CancelSynchronousIo(thread_);
    if (WaitForSingleObject(thread_, 5000) != WAIT_OBJECT_0) {
      // Fail closed: no stack/queue destruction while a writer still accesses it.
      ExitProcess(10);
    }
    return false;
  }
  return !Failed();
}
}
#endif
