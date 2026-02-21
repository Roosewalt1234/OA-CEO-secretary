// AudioWorklet processor for handling microphone input
class AudioProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.bufferSize = 4096;
    this.buffer = new Float32Array(this.bufferSize);
    this.bufferIndex = 0;
  }

  process(inputs, outputs, parameters) {
    const input = inputs[0];
    
    if (input && input.length > 0) {
      const inputChannel = input[0];
      
      // Calculate volume (RMS)
      let sum = 0;
      for (let i = 0; i < inputChannel.length; i++) {
        sum += inputChannel[i] * inputChannel[i];
      }
      const volume = Math.sqrt(sum / inputChannel.length);
      
      // Accumulate audio data
      for (let i = 0; i < inputChannel.length; i++) {
        this.buffer[this.bufferIndex++] = inputChannel[i];
        
        // When buffer is full, send it to main thread
        if (this.bufferIndex >= this.bufferSize) {
          this.port.postMessage({
            type: 'audio',
            data: this.buffer.slice(0),
            volume: volume
          });
          this.bufferIndex = 0;
        }
      }
      
      // Send volume update even if buffer isn't full
      if (this.bufferIndex < this.bufferSize) {
        this.port.postMessage({
          type: 'volume',
          volume: volume
        });
      }
    }
    
    return true; // Keep processor alive
  }
}

registerProcessor('audio-processor', AudioProcessor);
