/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from "react";
import { PatternThumbnail } from "./PatternThumbnail";
import { CollateralFilterType } from "../utils/collateralType";

interface SafeImageProps {
  src: string;
  alt: string;
  title: string;
  className?: string;
  // Collaterals only — see PatternThumbnail.
  kind?: CollateralFilterType;
}

export function SafeImage({ src, alt, title, className, kind }: SafeImageProps) {
  const [failed, setFailed] = useState(false);

  if (!src || failed) {
    return <PatternThumbnail title={title} kind={kind} />;
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
