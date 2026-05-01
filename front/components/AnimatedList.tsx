import React, { useRef, useState, useEffect, useCallback, ReactNode, MouseEventHandler, UIEvent } from 'react';
import { motion, useInView } from 'framer-motion';
import './AnimatedList.css';

interface AnimatedItemProps {
  children: ReactNode;
  delay?: number;
  index: number;
  onMouseEnter?: MouseEventHandler<HTMLDivElement>;
  onClick?: MouseEventHandler<HTMLDivElement>;
}

export const AnimatedItem: React.FC<AnimatedItemProps> = ({ children, delay = 0, index, onMouseEnter, onClick }) => {
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { amount: 0.1, once: false });
  return (
    <motion.div
      ref={ref}
      data-index={index}
      onMouseEnter={onMouseEnter}
      onClick={onClick}
      initial={{ scale: 0.8, opacity: 0, y: 20 }}
      animate={inView ? { scale: 1, opacity: 1, y: 0 } : { scale: 0.8, opacity: 0, y: 20 }}
      transition={{ type: 'spring', stiffness: 260, damping: 20, delay }}
      className="mb-4"
    >
      {children}
    </motion.div>
  );
};

interface AnimatedListProps {
  children: ReactNode;
  className?: string;
  displayScrollbar?: boolean;
}

const AnimatedList: React.FC<AnimatedListProps> = ({
  children,
  className = '',
  displayScrollbar = false
}) => {
  const listRef = useRef<HTMLDivElement>(null);
  const [topGradientOpacity, setTopGradientOpacity] = useState<number>(0);
  const [bottomGradientOpacity, setBottomGradientOpacity] = useState<number>(1);

  const handleScroll = useCallback((e: UIEvent<HTMLDivElement>) => {
    const target = e.target as HTMLDivElement;
    const { scrollTop, scrollHeight, clientHeight } = target;
    setTopGradientOpacity(Math.min(scrollTop / 50, 1));
    const bottomDistance = scrollHeight - (scrollTop + clientHeight);
    setBottomGradientOpacity(scrollHeight <= clientHeight ? 0 : Math.min(bottomDistance / 50, 1));
  }, []);

  return (
    <div className={`relative flex-1 min-h-0 flex flex-col ${className}`}>
      <div 
        ref={listRef} 
        className={`flex-1 overflow-y-auto scroll-smooth pb-10 pt-4 px-1 flex flex-col gap-4 ${!displayScrollbar ? 'no-scrollbar' : 'custom-scrollbar'}`} 
        onScroll={handleScroll}
      >
        {React.Children.map(children, (child, index) => {
          if (!React.isValidElement(child)) return child;
          return (
            <AnimatedItem key={child.key || index} index={index} delay={index * 0.05}>
              {child}
            </AnimatedItem>
          );
        })}
      </div>
    </div>
  );
};

export default AnimatedList;
