/**
 * Type augmentations for PowerPoint.js APIs that are newer than the bundled
 * `@microsoft/office-js` typings (office.d.ts). These exist at runtime in
 * current PowerPoint (PowerPointApi 1.8+) and are required for the OOXML
 * write-back machinery used by the PowerPoint tools.
 */

declare namespace PowerPoint {
  interface Slide {
    /**
     * Exports the slide to its own presentation file, returned as Base64 data.
     * [Api set: PowerPointApi 1.8]
     */
    exportAsBase64(): OfficeExtension.ClientResult<string>;
    /**
     * Renders an image of the slide. Scaled to fit the desired dimensions.
     * [Api set: PowerPointApi 1.8]
     */
    getImageAsBase64(options?: {
      width?: number;
      height?: number;
      format?: string;
    }): OfficeExtension.ClientResult<string>;
    /**
     * Moves the slide to a new position within the presentation.
     * [Api set: PowerPointApi 1.8]
     */
    moveTo(slideIndex: number): void;
    /**
     * Applies the specified layout to the slide.
     * [Api set: PowerPointApi 1.8]
     */
    applyLayout(slideLayout: PowerPoint.SlideLayout): void;
  }

  interface Presentation {
    /**
     * Gets the currently selected slides.
     * [Api set: PowerPointApi 1.5]
     */
    getSelectedSlides(): PowerPoint.SlideScopedCollection;
    /**
     * Gets the active slide in the presentation.
     * [Api set: PowerPointApi 1.7]
     */
    getActiveSlideOrNullObject(): PowerPoint.Slide;
  }

  class SlideScopedCollection extends OfficeExtension.ClientObject {
    readonly items: PowerPoint.Slide[];
    getCount(): OfficeExtension.ClientResult<number>;
    getItem(key: string): PowerPoint.Slide;
    getItemAt(index: number): PowerPoint.Slide;
    getItemOrNullObject(id: string): PowerPoint.Slide;
    load(propertyNames?: string | string[]): PowerPoint.SlideScopedCollection;
    toJSON(): PowerPoint.Interfaces.SlideCollectionData;
  }
}
