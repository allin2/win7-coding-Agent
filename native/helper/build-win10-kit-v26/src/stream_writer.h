#ifndef A9_STREAM_WRITER_H
#define A9_STREAM_WRITER_H
#include <string>
#ifdef _WIN32
#include <windows.h>
namespace spike02 {
// The worker uses Win32 exclusively; queue allocation happens through the process heap.
class StreamWriter {
 public:
  StreamWriter();
  ~StreamWriter();
  bool Enqueue(const std::string& frame);
  bool Failed();
  bool Finish();
 private:
  struct Node { Node* next; DWORD size; char data[1]; };
  static DWORD WINAPI Run(void* context);
  CRITICAL_SECTION lock_;
  HANDLE wake_ = nullptr;
  HANDLE thread_ = nullptr;
  Node* head_ = nullptr;
  Node* tail_ = nullptr;
  size_t bytes_ = 0;
  bool closing_ = false;
  bool failed_ = false;
};
}
#endif
#endif
