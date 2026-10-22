function slideIdOf(slide) {
  return slide?.id == null ? null : String(slide.id);
}

export function getVisibleSlides(slides, {
  showAllSlides = false,
  currentSlideId = null,
} = {}) {
  const list = Array.isArray(slides) ? slides.filter(Boolean) : [];
  if (showAllSlides || list.length === 0) return list;

  const problemSlides = list.filter(slide => slide?.problem);
  if (problemSlides.length === 0) return list;

  const currentId = currentSlideId == null ? null : String(currentSlideId);
  if (!currentId) return problemSlides;
  if (problemSlides.some(slide => slideIdOf(slide) === currentId)) return problemSlides;

  const hasCurrentSlide = list.some(slide => slideIdOf(slide) === currentId);
  return hasCurrentSlide
    ? list.filter(slide => slide?.problem || slideIdOf(slide) === currentId)
    : problemSlides;
}

