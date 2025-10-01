import React from 'react';

const Footer: React.FC = () => {
  return (
    <footer className="bg-dark text-white py-3 text-center mt-auto">
      <div className="container">
        <small>&copy; {new Date().getFullYear()} IC-FReD. All rights reserved.</small>
      </div>
    </footer>
  );
};

export default Footer;
