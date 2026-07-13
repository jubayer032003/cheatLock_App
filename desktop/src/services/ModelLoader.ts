export interface ModelMetadata {
  name: string;
  classesCount: number;
  classes: string[];
  inputShape: [number, number, number, number]; // [batch, channels, height, width]
  isLoaded: boolean;
}

export class ModelLoader {
  private static readonly OBJECT_CLASSES = [
    "Mobile Phone",
    "Tablet",
    "Laptop",
    "Calculator",
    "Book",
    "Notebook",
    "Paper Notes",
    "Smart Watch",
    "Earbuds",
    "Headphones",
    "USB Drive",
    "External Keyboard"
  ];

  private metadata: ModelMetadata = {
    name: "YOLOv8n-cheatlock-proctoring",
    classesCount: ModelLoader.OBJECT_CLASSES.length,
    classes: ModelLoader.OBJECT_CLASSES,
    inputShape: [1, 3, 640, 640],
    isLoaded: false
  };

  /**
   * Load YOLOv8n network model.
   */
  public async loadModel(): Promise<ModelMetadata> {
    if (this.metadata.isLoaded) return this.metadata;

    // Simulate weight loading delay (e.g. 500ms)
    await new Promise((resolve) => setTimeout(resolve, 500));

    this.metadata.isLoaded = true;
    console.log(`[ModelLoader] Model ${this.metadata.name} loaded successfully.`);
    return this.metadata;
  }

  public unloadModel() {
    this.metadata.isLoaded = false;
    console.log(`[ModelLoader] Model ${this.metadata.name} unloaded.`);
  }

  public getMetadata(): ModelMetadata {
    return this.metadata;
  }

  public getClasses(): string[] {
    return [...ModelLoader.OBJECT_CLASSES];
  }
}

export const modelLoader = new ModelLoader();
