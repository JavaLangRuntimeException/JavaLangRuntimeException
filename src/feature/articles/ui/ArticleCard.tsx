"use client";

import React from "react";
import { motion } from "framer-motion";
import Image from "next/image";

export interface ArticleCardProps {
    title: string;
    description?: string;
    url: string;
    image?: string;
    tags?: string[];
    index?: number;
    seriesKey?: string;
}

export function ArticleCard({ title, description, url, image, tags = [], index = 0, seriesKey = "all" }: ArticleCardProps) {
    const urlHash = url ? (url.split("/").pop() || url.replace(/[^a-zA-Z0-9]/g, "") || "unknown") : "empty";
    const safeUrlHash = urlHash || "fallback";
    const uniqueKey = `article-${seriesKey}-${safeUrlHash}-${index}-${url?.length || 0}`;

    return (
        <motion.a
            key={uniqueKey}
            href={url}
            target="_blank"
            rel="noopener noreferrer"
            className="group relative rounded-xl border border-white/20 bg-white/10 p-8 backdrop-blur transition-all duration-300 hover:bg-white/15 hover:scale-105 hover:shadow-xl hover:shadow-green-500/20 hover:border-green-500/30"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: index * 0.1, duration: 0.5 }}
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
        >
            {image && (
                <div className="mb-4 rounded-lg overflow-hidden border border-white/10 shadow-lg">
                    <Image
                        src={image}
                        alt={title || "Qiita 記事一覧"}
                        className="w-full h-56 object-cover group-hover:scale-105 transition-transform duration-300"
                        width={800}
                        height={320}
                        loading="lazy"
                        placeholder="blur"
                        blurDataURL="data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/4gHYSUNDX1BST0ZJTEUAAQEAAAHIAAAAAAQwAABtbnRyUkdCIFhZWiAH4AABAAEAAAAAAABhY3NwAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAQAA9tYAAQAAAADTLQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAlkZXNjAAAA8AAAACRyWFlaAAABFAAAABRnWFlaAAABKAAAABRiWFlaAAABPAAAABR3dHB0AAABUAAAABRyVFJDAAABZAAAAChnVFJDAAABZAAAAChiVFJDAAABZAAAAChjcHJ0AAABjAAAADxtbHVjAAAAAAAAAAEAAAAMZW5VUwAAAAgAAAAcAHMAUgBHAEJYWVogAAAAAAAAb6IAADj1AAADkFhZWiAAAAAAAABimQAAt4UAABjaWFlaIAAAAAAAACSgAAAPhAAAts9YWVogAAAAAAAA9tYAAQAAAADTLXBhcmEAAAAAAAQAAAACZmYAAPKnAAANWQAAE9AAAApbAAAAAAAAAABtbHVjAAAAAAAAAAEAAAAMZW5VUwAAACAAAAAcAEcAbwBvAGcAbABlACAASQBuAGMALgAgADIAMAAxADb/2wBDABQODxIPDRQSEBIXFRQdHx4eHRoaHSQtJSEkLzYvLy02LjY2OjY2Njo2NjY2NjY2NjY2NjY2NjY2NjY2NjY2Njb/2wBDAR0XFx8aHx4fHx8fHx8fHx8fHx8fHx8fHx8fHx8fHx8fHx8fHx8fHx8fHx//wAARCAAIAAoDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAb/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/8QAFQEBAQAAAAAAAAAAAAAAAAAAAAX/xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oADAMBAAIRAxEAPwCdABmX/9k="
                    />
                </div>
            )}
            <div className="flex items-start gap-3 mb-3">
                <div className="w-2 h-2 mt-2 rounded-full bg-green-400 animate-pulse flex-shrink-0" />
                <h2 className="text-xl font-semibold text-white group-hover:text-green-300 transition-colors line-clamp-2">
                    {title}
                </h2>
            </div>
            {description && (
                <p className="text-sm text-zinc-300/90 line-clamp-4 mb-4">
                    {description}
                </p>
            )}
            {tags.length > 0 && (
                <div className="flex flex-wrap gap-2 mb-4">
                    {tags.slice(0, 8).map((tag, tagIdx) => (
                        <span key={`${uniqueKey}-tag-${tagIdx}`} className="px-3 py-1 text-xs rounded-full bg-green-500/20 text-green-300 border border-green-500/30">
                            {tag}
                        </span>
                    ))}
                </div>
            )}
            <div className="mt-4 flex items-center text-green-400 group-hover:text-green-300 transition-colors">
                <span className="text-sm font-semibold">記事を読む</span>
                <motion.span className="ml-2" animate={{ x: [0, 5, 0] }} transition={{ duration: 1.5, repeat: Infinity }}>
                    →
                </motion.span>
            </div>
        </motion.a>
    );
}



