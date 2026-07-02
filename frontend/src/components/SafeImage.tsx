/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from "react";
import { PatternThumbnail } from "./PatternThumbnail";

interface SafeImageProps {
  src: string;
  alt: string;
  title: string;
  className?: string;
}

export function SafeImage({ src, alt, title, className }: SafeImageProps) {
  const [failed, setFailed] = useState(false);

  if (!src || failed) {
    return <PatternThumbnail title={title} />;
  }

  return (
    <img
      src={src}
      alt={alt}
      className={className}
      referrerPolicy="no-referrer"
      onError={() => setFailed(true)}
    />
  );
}
