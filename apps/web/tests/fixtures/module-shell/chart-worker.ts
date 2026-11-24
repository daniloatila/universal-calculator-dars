self.onmessage = ({ data }: MessageEvent<unknown>) => {
  if (typeof data === 'number') self.postMessage(data);
};
