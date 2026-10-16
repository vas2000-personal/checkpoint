"use client";
import {Component} from 'react';
// One boundary per card instead of one for the board: a malformed study row or a broken trail SVG
// should cost the family that one card, not the whole page.
export default class ErrorBoundary extends Component{
 state={failed:false};
 static getDerivedStateFromError(){return {failed:true}}
 componentDidCatch(error){console.error('Checkpoint card failed:',error)}
 render(){return this.state.failed?this.props.fallback:this.props.children}
}
